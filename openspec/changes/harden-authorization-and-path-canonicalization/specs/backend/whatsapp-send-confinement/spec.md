## Purpose

Define el contrato de confinamiento del envío de WhatsApp: los mensajes se envían **solo** al número configurado de la congregación, con plantilla y componentes decididos por el servidor, el contenido multimedia está acotado en tamaño antes de decodificarse, y no queda ningún camino (síncrono ni por cola) que permita enviar desde las credenciales de Meta de la congregación a un número arbitrario elegido por el cliente.

## ADDED Requirements

### Requirement: Messages are sent only to the configured destination

El sistema SHALL enviar los mensajes de WhatsApp exclusivamente a `whatsapp.destinationNumber` (configuración servidor). El campo `destinationNumber` del cuerpo de una petición de envío SHALL ser ignorado por completo: no determina el destinatario y no puede ser usado para redirigir un envío a otro número. La plantilla, el idioma y los componentes del mensaje SHALL ser elegidos por el servidor a partir de los datos del reporte, no del cliente.

#### Scenario: Client-supplied destination is ignored
- **WHEN** un cliente autenticado envía `POST /api/v1/reports/send` con `destinationNumber` apuntando a un número arbitrario
- **THEN** el mensaje se entrega al número configurado del servidor y nunca al número indicado por el cliente

#### Scenario: Server chooses template and components
- **WHEN** un cliente autenticado envía `POST /api/v1/reports/send`
- **THEN** el sistema construye el mensaje con la plantilla, idioma y parámetros configurados/derivados de los datos del reporte, sin aceptar plantilla ni componentes del cliente

### Requirement: No queue-based send path exists

El sistema SHALL NOT exponer ningún endpoint ni consumidor de cola que permita enviar un mensaje de WhatsApp fuera de `POST /api/v1/reports/send` y de las reglas del requisito anterior. El endpoint asíncrono `POST /api/v1/reports/whatsapp/async` SHALL dejar de existir (responde `404 Not Found`) y el consumidor de cola que publicaba el envío SHALL estar eliminado.

#### Scenario: Async endpoint is gone
- **WHEN** un cliente envía `POST /api/v1/reports/whatsapp/async` con cualquier cuerpo y sesión
- **THEN** el sistema responde `404 Not Found` y no publica nada en ninguna cola

#### Scenario: No listener can bypass the destination lock
- **WHEN** se inspecciona la aplicación desplegada (compilación y configuración)
- **THEN** no existe ningún consumidor de cola para envíos de WhatsApp y ningún otro camino de código puede publicar un mensaje con destino elegido por el cliente

### Requirement: Media upload is size-capped before decoding

El sistema SHALL rechazar el contenido multimedia adjunto cuando su representación Base64 supere 2 MB (2 097 152 caracteres), comprobado **antes** de decodificarlo a bytes, con `413 Payload Too Large`. La comprobación previa al decode evita que una cadena enorme del cliente se materialice en memoria sin límite.

#### Scenario: Oversized media is rejected before decoding
- **WHEN** un cliente autenticado envía `POST /api/v1/reports/send` adjuntando una captura Base64 de más de 2 MB
- **THEN** el sistema responde `413 Payload Too Large`, no decodifica la cadena y no envía ningún mensaje

#### Scenario: Media at or under the cap is accepted
- **WHEN** un cliente autenticado envía `POST /api/v1/reports/send` adjuntando una captura Base64 de 2 MB o menos
- **THEN** el sistema la decodifica y la sube a Meta como parte del envío normal (salvo fallos propios de Meta)