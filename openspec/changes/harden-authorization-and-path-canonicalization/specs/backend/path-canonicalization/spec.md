## Purpose

Define el contrato de canonicalización de la ruta en el borde de las peticiones: **ambos** bordes (gateway reactivo y filtro servlet de los servicios de datos) deben calcular UNA forma canónica de la ruta antes de compararla contra las reglas de autorización, y deben fallar de forma segura (fail-closed) cuando la ruta no se pueda normalizar. El borde y el enrutador de Spring no ven la misma cadena; la canonicalización cierra esa divergencia en la dirección de negar más, nunca de permitir más.

## ADDED Requirements

### Requirement: Request path is canonicalized once before rule matching

El sistema SHALL canonicalizar la ruta de la petición **una única vez, en el borde del filtro**, antes de buscar la regla de autorización que aplica. La coincidencia de reglas SHALL usar siempre la forma canónica, nunca la cadena cruda tal como la escribió el cliente.

La forma canónica SHALL:
- decodificar los escapes percent (UTF-8) **por segmento**, usando solo dígitos hexadecimales ASCII — `%61dmin` y `admin` son la misma ruta para las reglas;
- tratar `+` como carácter literal (no como espacio);
- resolver los segmentos `.`, `..` y vacíos (`//`), colapsando la ruta — `/api/./v1/..` etc. caen en las mismas reglas que su forma limpia;
- rechazar los escapes percent malformados (por ejemplo, `%zz` o `%1` truncado) antes de cualquier comparación: `400 Bad Request` en el borde servlet y `401 Unauthorized` en el borde gateway (fail-closed en ambos).

#### Scenario: Percent-encoded admin path matches the admin rule
- **WHEN** un cliente envía una petición a `/api/v1/territories/%61dmin/manzanas` sin sesión de administrador
- **THEN** el sistema canonicaliza `%61dmin` → `admin`, la petición cae en la regla de administrador y se responde `401 Unauthorized` sin llegar al handler

#### Scenario: Dot and duplicate-slash segments are resolved
- **WHEN** un cliente envía una petición a `/api/v1//territories/./manzanas` sin sesión de administrador
- **THEN** el sistema colapsa los segmentos vacíos y `.` y la petición cae en las mismas reglas que `/api/v1/territories/manzanas`

#### Scenario: Parent-dot segments are resolved (and clipped at root)
- **WHEN** un cliente envía una petición a `/api/../api/v1/territories/admin/manzanas` sin sesión de administrador
- **THEN** el sistema resuelve `..` contra el segmento previo (sin subir por encima de la raíz) y la petición cae en la regla de administrador

#### Scenario: Encoded dot segments are decoded and then resolved
- **WHEN** un cliente envía una petición a `/api/%2e%2e/api/v1/territories/admin/manzanas` sin sesión de administrador
- **THEN** el sistema decodifica `%2e%2e` → `..` y luego lo resuelve, de modo que la petición cae en la regla de administrador (no hay forma de "esconder" dots tras un escape)

#### Scenario: Malformed percent escape is rejected
- **WHEN** un cliente envía una petición con un escape percent malformado (por ejemplo `/api/v1/territories/%zz/manzanas` o un `%` final truncado)
- **THEN** el sistema rechaza la petición con un 4xx antes de comparar reglas o ejecutar cualquier lógica: `400 Bad Request` en el borde servlet (filtro de los servicios de datos) y `401 Unauthorized` en el borde gateway — fail-closed en ambos

#### Scenario: Plus sign stays literal
- **WHEN** un cliente envía una petición cuya ruta contiene `+` (por ejemplo, un identificador con signo más)
- **THEN** el sistema conserva el `+` literal (no lo interpreta como espacio), sin cambiar la regla que aplica

### Requirement: Both filter edges canonicalize (gateway and data services)

El sistema SHALL aplicar la canonicalización en los dos bordes de autenticación: el filtro del gateway (reactivo, antes de enrutar) y el filtro servlet de cada servicio de datos (territory y reporting). El gateway SHALL comparar las reglas contra la ruta **decodificada** de la petición, no contra la cadena cruda.

#### Scenario: Gateway canonicalizes before routing
- **WHEN** una petición llega al gateway con una ruta no canónica que apunta a una operación de administración
- **THEN** el gateway aplica las reglas sobre la forma canónica y responde `401 Unauthorized`/`403 Forbidden` sin enrutar la petición a ningún servicio sin autorización

#### Scenario: Servlet filter canonicalizes when gateway is bypassed
- **WHEN** una petición llega directamente al servicio de datos (sin pasar por el gateway) con una ruta no canónica de una operación de administración
- **THEN** el filtro servlet aplica las mismas reglas sobre la forma canónica y rechaza la petición sin sesión de administrador

### Requirement: Canonicalization fails closed (deny-more divergence)

La forma canónica SHALL ser **al menos tan restrictiva** como la que calcula el enrutador de Spring: toda petición que el enrutador considere una operación admin también SHALL caer en la regla admin tras canonicalizar. La divergencia deliberada en el sentido de normalizar más (y por tanto negar más) es un invariante de seguridad: ninguna petición que el enrutador lleve al panel/comportamiento admin puede escapar de la regla admin.

#### Scenario: Wildcard patterns cannot smuggle dot segments past rules
- **WHEN** una petición contiene segmentos `..` y coincide con reglas comodín de Spring (p. ej. `/api/**`, que también coincide con rutas que llevan `..`)
- **THEN** la canonicalización previa del borde sigue aplicando la regla correcta: la protección no depende de que Spring "falle el match" (que solo ocurre con patrones exactos)