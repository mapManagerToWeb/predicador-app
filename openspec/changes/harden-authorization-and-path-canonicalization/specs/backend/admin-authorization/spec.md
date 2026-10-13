## Purpose

Define el contrato de autorización de las operaciones de administración del backend: **toda** operación admin debe ser autorizada por una comprobación explícita e independiente de cómo esté escrita la URL (`AuthorizationService.requireAdmin`), ejecutada como primera instrucción del handler, y compartida entre los servicios de datos (territory y reporting). Las reglas de URL del borde siguen existiendo como primera capa, pero nunca son la única barrera.

## ADDED Requirements

### Requirement: Admin handlers authorize explicitly before any business logic

El sistema SHALL rechazar con `401 Unauthorized` o `403 Forbidden` cualquier petición a una operación de administración cuando la sesión no tenga el rol de administrador (o no exista), **sin ejecutar ninguna lógica de negocio** ni cambiar estado. La comprobación SHALL ejecutarse como primera instrucción del handler, antes de validar, leer o escribir datos.

Esto aplica a todas las operaciones admin de ambos servicios de datos, incluidas las que antes dependían solo de la expresión regular del borde, como `PUT /api/v1/territories/{n}/color`.

#### Scenario: Admin operation without session
- **WHEN** un cliente envía una petición a una operación de administración sin token de sesión
- **THEN** el sistema responde `401 Unauthorized` y no ejecuta ninguna lógica de negocio ni cambia estado

#### Scenario: Admin operation with non-admin session
- **WHEN** un cliente envía una petición a una operación de administración con una sesión válida que no tiene rol de administrador
- **THEN** el sistema responde `401 Unauthorized` (borde) o `403 Forbidden` (handler) y no ejecuta ninguna lógica de negocio ni cambia estado

#### Scenario: Admin operation with admin session
- **WHEN** un cliente envía una petición a una operación de administración con una sesión válida con rol de administrador
- **THEN** la operación se ejecuta normalmente (salvo que falle por otras validaciones propias del recurso)

#### Scenario: Admin operation authorized regardless of URL spelling
- **WHEN** un cliente escribe la URL de una operación de administración de forma no canónica (percent-encoding de caracteres ASCII, segmentos `.`/`..`, barras duplicadas) con una sesión sin rol de administrador
- **THEN** el sistema responde `401 Unauthorized` o `403 Forbidden` y no ejecuta la operación: la autorización no depende de cómo esté escrita la URL

#### Scenario: assignColor is gated
- **WHEN** un cliente envía `PUT /api/v1/territories/{n}/color` con una sesión que no tiene rol de administrador
- **THEN** el sistema responde `401 Unauthorized` o `403 Forbidden` y no modifica el color del territorio

### Requirement: Authorization service is shared and injectable by both data services

El mecanismo de autorización admin SHALL vivir en el módulo transversal compartido (`backend/shared`), de modo que territory-service y reporting-service puedan inyectarlo **sin dependencia entre servicios**. El contrato distingue: sesión nula, sesión con rol insuficiente y sesión admin; los dos primeros casos SHALL lanzar un error de prohibición (`403 Forbidden` en el handler).

#### Scenario: Territory service can authorize without reporting dependency
- **WHEN** territory-service compila y ejecuta comprobaciones de administrador usando el servicio compartido
- **THEN** lo hace sin depender de reporting-service (el módulo compartido es la única dependencia nueva)

#### Scenario: Null session fails closed outside dev mode
- **WHEN** un handler llama a la comprobación de administrador con sesión nula en un despliegue con autenticación operativa (secreto configurado, modo estricto)
- **THEN** la comprobación lanza un error de prohibición y la operación se responde `403 Forbidden`

### Requirement: No admin operation depends solely on URL rules

Ninguna operación de administración SHALL quedar protegida únicamente por la expresión regular del borde: cada handler admin incluye la comprobación explícita. La capa de URL (regex del borde) permanece como primera barrera y como protección de rutas sin handler propio, pero no es suficiente por sí sola.

#### Scenario: New admin handler cannot regress to regex-only
- **WHEN** se agrega o modifica una operación de administración sin incluir la comprobación explícita en el handler
- **THEN** la revisión/testing del cambio lo detecta como violación de este requisito (el contrato exige la comprobación en el handler)