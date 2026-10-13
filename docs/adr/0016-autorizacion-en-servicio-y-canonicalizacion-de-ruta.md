# ADR 0016: Autorizacion en la capa de servicio y canonicalizacion de la ruta

## Status

Accepted

> Nota de numeracion: el numero 0015 esta ocupado por
> `0015-baseline-deps-contra-cves.md` (fijar dependencias transitivas), que
> estaba sin commitear cuando se escribio este. Los comentarios del codigo que
> decian "ADR 0015" se actualizaron a 0016.

## Context

Una revision de seguridad encontro que la autorizacion de los endpoints de
administracion no tenia control en la capa de servicio. Los tres controladores
del panel —`ReportAdminController` y `EncargadoAdminController` (reporting) y
`TerritoryAdminController` (territory)— no tenian ni una referencia a
`AuthorizationService`: el unico control era una expresion regular de URL
evaluada en un filtro de servlet (`SessionAuthFilter`), con el gateway como
segundo filtro de la misma especia.

Eso solo funciona mientras la URL sea escrita exactamente como la regla la
espera. El filtro comparaba `req.getRequestURI()`, que Tomcat entrega **sin
decodificar**, mientras que Spring enruta sobre la ruta **decodificada**: con
`%61dmin` en lugar de `admin`, `//` o `/./`, el filtro no encontraba la regla,
dejaba pasar la peticion como publica, y el enrutador si la llevaba al panel de
administracion. Es decir, la unica barrera se esquivaba escribiendo la misma
URL de otra forma.

El arreglo natural —poner `requireAdmin(...)` en cada handler— tropezaba con
un limite de modulos: `AuthorizationService` vivia en `reporting-service`, asi
que **territory-service no la podia ver**. `territory-service` depende de
`shared` (y solo de `shared`); `reporting-service` no es una dependencia suya.
El servicio de autorizacion importaba unicamente clases de `shared`
(`SessionToken`, `SessionTokenService`, `ForbiddenOperationException`), de modo
que la dependencia era ya de una sola direccion y hacia falta.

## Decision

- **`AuthorizationService` se mueve a `com.predicador.shared.security`**
  (`backend/shared`), sin dependencias de modulo nuevas: sus unicos imports ya
  eran de `shared`. Los tres servicios la reciben por inyeccion.
  `RequestTokens` la acompana como helper de solo lectura para no repetir el
  `(SessionToken) request.getAttribute(ATTR_TOKEN)` —con su cast y su posible
  `ClassCastException`— en cada handler.
- **Cada handler de administracion llama `requireAdmin(...)` como primera
  sentencia.** Los controladores que no recibian `HttpServletRequest` pasaron a
  recibirlo. Son **29 handlers**: 10 de `TerritoryAdminController`, 9 de
  `ReportAdminController` y 10 de `EncargadoAdminController`.
  La comprobacion no depende de como se escribio la URL, que es exactamente lo
  que fallaba.
  `PUT /api/v1/territories/{n}/color` (`TerritoryController.assignColor`) tambien
  la lleva: es una escritura de estado que solo deberia hacer el panel, y hasta
  la ronda 2 dependia solo de la expresion regular.
- **La ruta se canonicaliza UNA vez, en el borde del filtro**
  (`RequestPathCanonicalizer`), antes de `findMatchingRule`: se decodifican los
  escapes percent y se resuelven `.`, `..` y los segmentos vacios, de modo que
  `%61dmin`, `//` y `/./` caen en la misma regla que `admin`.
  - **La forma canonica NO es "la que calcula Spring", y esa distincion es
    deliberada.** Medido contra spring-web 7.0.9 (ver "Verificacion
    empirica"): `RequestPath.parse` y `PathPatternParser` decodifican percent
    escapes **por segmento** (en `valueToMatch()`, que es lo que compara el
    enrutador), **no colapsan `//`**, **no resuelven `..`** y **NO eliminan
    los segmentos `.`**: los conservan como literales y los comparan tal cual
    contra el patron. La divergencia con el canonicalizador es
    bidireccional: con un patron exacto el enrutador ve un segmento `.`
    literal y responde 404 ante `/api/./v1/x` (que el filtro normaliza y
    compara con la regla); con un patron `/**` (p. ej. `/api/**`) el
    enrutador SI empareja `/api/./v1/x` y `/api/../api/v1/x`, formas que el
    filtro solo ve ya en forma canonica. En ambos casos el canonicalizador
    normaliza de mas a proposito, y normalizar mas significa que una peticion
    cae en MAS reglas, es decir, que se **deniega** mas: la divergencia va en
    la direccion **fail-closed**. Un canonicalizador que coincidiera
    exactamente con Spring dejaria pasar rutas que el enrutador acaba
    sirviendo sin haber pasado por la regla.
    **No "corrijamos" el canonicalizador para igualarlo a Spring**: eso
    reintroduce el bypass. Esta nota esta aqui precisamente para el siguiente
    mantenedor que lea el ADR y quiera simplificar la clase.
    - Corolario corregido: el "404 del enrutador" ante `..` solo vale para
      patrones exactos; con `/**` Spring no lo resuelve pero si lo empareja
      como un segmento mas. El invariante que se protege es del
      canonicalizador, no del router.
  - *Verificacion empirica (2026-10-08)*: reproduccion en jshell contra
    spring-web 7.0.9 (`RequestPath.parse` + `PathPatternParser`) que confirma
    los hechos (a)-(e): percent decodificado por segmento en `valueToMatch()`,
    segmento `.` conservado (no eliminado), `//` no colapsado, `..` no
    resuelto, y `/api/**` emparejando `/api/./v1/x` y `/api/../api/v1/x`.
    Guion:
    `/private/var/folders/bq/tvng30p965bczc7lltdsdpn40000gn/T/opencode/spring-verify.jsh`.
  - *Canonicalizar y comparar, y no rechazar cualquier `%`*: los escapes
    percent son legales en una ruta y algunos endpoints los necesitan
    (identificadores con caracteres reservados, nombres con `ñ` o tildes). Un
    filtro que rechazara `%` cerraria esos endpoints y ademas seria
    incorrecto: el `%` es ambiguo, no malicioso; lo que decide es a que
    endpoint apunta la peticion, y eso lo resuelve la canonicalizacion.
    Un `+` no se convierte en espacio (a diferencia de `URLDecoder`): en una
    ruta no lo es.
  - Un escape **mal formado** (`%zz`, `%A` suelto) si es un error: se lanza y el
    filtro responde **400**, porque no hay forma canonica que comparar y
    comparar la ruta cruda seria justamente el fallo que se esta corrigiendo.
  - Un `..` que sube por encima de la raiz se descarta en vez de atacar hacia
    atras. Dejar la ruta corta nunca relaja una regla.
- **Se aplica el mismo canonicalizador al filtro reactivo del gateway**
  (`ReactiveSessionAuthFilter`), que tenia la misma divergencia. Es el mismo
  bug en la otra mitad del borde.
- **Las expresiones regulares de `SecurityRules` se conservan** como segunda
  capa. No son la unica barrera: siguen siendo la primera, y hacen el trabajo
  que no hace una comprobacion en el handler — que una peticion sin sesion no
  llegue siquiera al controlador, y el limite de peticiones del borde. Borrarlas
  dejaria la autorizacion en una sola capa y perderian ese efecto.
- **C1 (mismo trabajo, mismo ADR)**: `ReportSendService` usa siempre
  `props.destinationNumber()`; el `destinationNumber` del cliente se ignora. Y
  `WhatsAppMediaClient` topa la cadena Base64 en 2 MB antes de decodificarla,
  porque `Base64.getDecoder()` la convertiria a bytes en memoria sin limite.
- **C1, cierre (ronda 2): se elimina el envio asincrono por cola.** Arreglar
  `ReportSendService` no cerraba el agujero: `POST /api/v1/reports/whatsapp/async`
  era un segundo camino de envio, con `requireAuthenticated` en vez de
  authorization de destino, que publicaba en RabbitMQ un DTO con
  `destinationNumber`, `templateName`, `languageCode` y `components` elegidos
  por el cliente. El listener los pasaba tal cual a
  `WhatsAppMessageClient.sendTemplateMessage`, o sea: cualquier usuario
  registrado podia mandar desde las credenciales de Meta de la congregacion a
  un numero arbitrario, con una plantilla arbitraria. Arreglar un camino de
  envio y dejar el otro es no arreglar nada.
  Se **borraron** `WhatsAppSendPublisher`, `WhatsAppSendListener`, el DTO
  `WhatsAppMessageRequest`, el handler `POST /whatsapp/async` y los metodos
  `WhatsAppSendService.sendTemplateMessage` / `sendRaw` que solo existian para
  ese camino.
  **Lo que NO se borro y por que**: `WhatsAppSendRequest` (otro DTO, del
  endpoint sincrono), `ReportSendService`, `WhatsAppMessageClient` y
  `WhatsAppMediaClient` (con su tope de 2 MB), y
  `GET /api/v1/reports/send/{key}`. Ese endpoint de estado lo sigue usando el
  camino vivo: el frontend hace POST a `/reports/send` y luego sondea el estado.
  Que quede un unico camino de envio, con destino y plantilla decididos por el
  servidor, es el objetivo.

## Consequences

- `backend/shared` es el nucleo arquitectonico y ya lo era (seguridad,
  excepciones, `PhoneUtil`); `AuthorizationService` se suma a esa superficie.
  Cambios ahi son de alto riesgo.
- Los 29 handlers de administracion ahora necesitan `HttpServletRequest`. Los
  tests que los instancian directamente tienen que pasar la autorizacion.
- Un controlador nuevo de administracion tiene que acordarse de llamar
  `requireAdmin`. Nada obliga a que lo haga: la red de seguridad es que el
  filtro y el gateway siguen exigiendo rol admin por URL. Un handler olvidado
  queda protegido por la primera capa, no desprotegido — pero conviene recordarlo
  al anadir rutas de administracion.
- `session.secret` sin configurar (perfil `local`) deja `requireAdmin` sin
  enforcement, como ya ocurria con `requireAuthenticated`. Es el comportamiento
  ya documentado de los tests de autorizacion;fuera de `local` el arranque
  falla si no hay secreto.
- El filtro reactivo del gateway responde **401** tambien ante un escape mal
  formado, mientras que el de servlet responde **400**. Es deliberado: en el
  gateway no se invoca `reject` con otro codigo, y 401 no relaja nada. Si se
  quiere que ambos respondan 400, es un cambio propio.
- Los tests que afirmaban el comportamiento vulnerable (un `destinationNumber`
  del cliente respetado) se invirtieron o se borraron. La regresion viva de C1
  es `ReportSendServiceTest#sendReport_ignoraElDestinoDelClienteYUsaElConfigurado`:
  afirma que el envio real va al `props.destinationNumber()` configurado. El
  camino por cola ya no existe, asi que sus tests se borraron con el.
- **La plomeria de RabbitMQ en `reporting-service` quedo muerta, y NO se
  borro.** `RabbitMQConfig` (exchange, queue, binding, `RabbitTemplate`,
  `MessageConverter`) ya no lo consume nadie en el codigo de aplicacion, porque
  el unico publisher y el unico listener eran los del camino eliminado. Se deja
  a proposito: `spring-boot-starter-amqp` sigue declarado, `docker-compose.yml`
  sigue aprovisionando `rabbitmq`, y puede hacer falta para otro flujo.
  Borrarlo es una decision propia, con su propio PR y su propia justificacion;
  el paso siguiente de limpieza (borrar el modulo amqp y el servicio del
  compose) no se hizo aqui.

## Actualizacion (2026-10-13): el destino es el encargado con sesion

El reporte debe llegarle al hermano que lo envia (el bot no puede estar en el
grupo de predicacion). El destino sigue sin venir del cliente: `DestinoWhatsApp`
lo busca en la base segun la sesion (telefono registrado del encargado, validado
como celular chileno). `WHATSAPP_DESTINATION` queda solo como respaldo (sesion de
administrador o encargado sin celular valido).
