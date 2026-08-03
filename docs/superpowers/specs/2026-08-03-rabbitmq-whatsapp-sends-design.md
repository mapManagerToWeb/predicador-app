# RabbitMQ para Envíos WhatsApp — Spec

**Fecha:** 2026-08-03
**Branch:** `feature/rabbitmq-whatsapp-sends`
**Base:** commit `3365cc1` (`chore/angular-best-practices`)

---

## 1. Resumen

Sustituir el `ThreadPoolTaskExecutor` en memoria de `WhatsAppSendService` por una cola **RabbitMQ durable** que garantice:
- Durabilidad del mensaje ante reinicios/caídas del servicio.
- Retries selectivos con backoff y **dead-letter queue (DLQ)** para fallos permanentes.
- Mantener la API HTTP actual (`POST /reports/send` 202 + `GET /reports/send/{key}` polling) y la idempotencia en BD (`WhatsAppDelivery`).

---

## 2. Arquitectura

```
+-------------------+       RabbitMQ        +----------------------+
|  WhatsAppSendSvc  |  (publisher confirms) |  Listener @Queue     |
|  .submit()        |---------------------->|  whatsapp.send       |
|  202 IN_PROGRESS  |                       |  .onMessage()        |
+-------------------+                       +----------+-----------+
                                                      |
                                                      v
                                           +----------------------+
                                           | ReportSendService    |
                                           | .sendReport(req, key)|
                                           | (idempotencia BD)    |
                                           +----------+-----------+
                                                      |
                                                      v
                                           +----------------------+
                                           | WhatsApp (Meta) API  |
                                           | Media + Template     |
                                           +----------------------+
```

**Componentes clave:**
- Exchange: `whatsapp.topic` (topic, durable)
- Queue principal: `whatsapp.send` (durable, `x-dead-letter-exchange=whatsapp.dlx`, `x-dead-letter-routing-key=whatsapp.send.dlq`)
- DLX: `whatsapp.dlx` (topic, durable)
- DLQ: `whatsapp.send.dlq` (durable, binding a DLX con routing key `whatsapp.send.dlq`)

---

## 3. Flujo de Datos Detallado

### 3.1 Publicación (request HTTP)
1. Cliente llama `POST /api/v1/reports/send` con body `WhatsAppSendRequest` y header `Idempotency-Key` (UUID).
2. `WhatsAppSendService.submit()`:
   - Verifica si existe `WhatsAppDelivery` en BD para la clave:
     - Completada → devuelve 200 con estado final.
     - En progreso → devuelve 202 `IN_PROGRESS`.
     - No existe → reserva `IN_PROGRESS` (crea fila en BD), publica en RabbitMQ, devuelve 202.
3. Publicación: `rabbitTemplate.convertAndSend("whatsapp.topic", "whatsapp.send", message, correlationData)` con **publisher confirms** correlacionados (bloquea hasta ACK del broker).
4. Respuesta HTTP inmediata.

### 3.2 Consumo (worker asíncrono)
1. `@RabbitListener(queues = "whatsapp.send")` recibe mensaje.
2. Deserializa a `WhatsAppMessage` (contiene request + idempotencyKey).
3. Llama a `ReportSendService.sendReport(request, idempotencyKey)` — **worker existente sin cambios**.
   - `sendReport` reserva/realiza idempotencia, sube imagen a Meta, envía template, persiste resultado (SUCCEEDED/FAILED).
3. Resultado:
   - Éxito → `channel.ack()`.
   - Fallo transitorio (`WhatsAppIntegrationException` 5xx/504, `ResourceAccessException`) → `channel.nack(requeue=true)` con **retry con backoff** (configurado en listener container).
   - Fallo permanente (4xx de Meta) → `channel.nack(requeue=false)` → va a DLQ vía DLX; BD marcada `FAILED`.

### 3.3 Consultas de estado (polling)
- `GET /api/v1/reports/send/{idempotencyKey}` → lee `WhatsAppDelivery` de BD → devuelve `WhatsAppDeliveryDto` (IN_PROGRESS/SUCCEEDED/FAILED). **Sin cambios**.

---

## 4. Configuración

### 4.1 Docker Compose (`docker-compose.yml`)
```yaml
services:
  rabbitmq:
    image: rabbitmq:3.12-management
    profiles: ["messaging"]
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-predicador}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}
      RABBITMQ_DEFAULT_VHOST: ${RABBITMQ_VHOST:-predicador}
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      timeout: 5s
      retries: 5
```

### 4.2 Config Server (`config-server/src/main/resources/config/reporting-service.yml`)
```yaml
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST:rabbitmq}
    port: ${RABBITMQ_PORT:5672}
    username: ${RABBITMQ_USER:predicador}
    password: ${RABBITMQ_PASS}
    virtual-host: ${RABBITMQ_VHOST:predicador}
    publisher-confirm-type: correlated
    publisher-returns: true
    listener:
      simple:
        retry:
          enabled: true
          initial-interval: 2000
          max-interval: 30000
          multiplier: 2.0
          max-attempts: 3
        default-requeue-rejected: false
```

### 4.3 Declaración de colas (RabbitConfig)
```java
@Configuration
class RabbitConfig {
    @Bean Queue whatsappSendQueue() {
        return QueueBuilder.durable("whatsapp.send")
            .withArgument("x-dead-letter-exchange", "whatsapp.dlx")
            .withArgument("x-dead-letter-routing-key", "whatsapp.send.dlq")
            .build();
    }
    @Bean Queue whatsappDlq() {
        return QueueBuilder.durable("whatsapp.send.dlq").build();
    }
    @Bean TopicExchange whatsappTopic() {
        return new TopicExchange("whatsapp.topic", true, false);
    }
    @Bean TopicExchange dlx() {
        return new TopicExchange("whatsapp.dlx", true, false);
    }
    @Bean Binding bindSend() {
        return BindingBuilder.bind(whatsappSendQueue()).to(whatsappTopic()).with("whatsapp.send");
    }
    @Bean Binding bindDlq() {
        return BindingBuilder.bind(whatsappDlq()).to(dlx()).with("whatsapp.send.dlq");
    }
}
```

---

## 5. Manejo de Errores y Retries

| Tipo de error | Ejemplo | Acción |
|---|---|---|
| **Transitorio** | `ResourceAccessException` (timeout Meta), 5xx Meta, 504 | `nack(requeue=true)` → retry con backoff exponencial (3 intentos) |
| **Permanente** | 4xx Meta (token inválido, plantilla inexistente, número inválido) | `nack(requeue=false)` → DLQ + BD `FAILED` |
| **Desconocido** | Cualquier otro `RuntimeException` | Log + `nack(requeue=true)` (3 retries) → DLQ |

**Idempotencia garantizada:**
- La BD `WhatsAppDelivery` con `idempotencyKey` (PK) evita duplicados.
- El worker `ReportSendService.sendReport(request, key)` ya implementa:
  - `reserve(key)`: crea `IN_PROGRESS` o devuelve `replay` si completado.
  - Lanza `409` si lease activo (evita doble procesamiento).
- El consumer llama a `sendReport`; si la entrega ya está completada, `sendReport` devuelve el resultado guardado sin reenviar a Meta.

---

## 6. Testing

### 6.1 Unit (mocks)
- `WhatsAppSendServiceTest`: mock `RabbitTemplate`, verificar `convertAndSend` con `CorrelationData` y payload correcto.
- `WhatsAppListenerTest`: mock `ReportSendService`, verificar llamada y ack/nack según resultado.
- `RabbitConfigTest`: verificar declaración de queues/exchanges/bindings.

### 6.2 Integration (Testcontainers)
- Levantar RabbitMQ real en contenedor.
- Publicar mensaje → consumir → verificar BD `WhatsAppDelivery` actualizada a `SUCCEEDED`.
- Simular fallo transitorio → 3 retries → éxito → BD `SUCCEEDED`.
- Simular fallo permanente → DLQ → BD `FAILED`.
- Probar idempotencia: publicar dos veces misma clave → solo un envío a Meta.

### 6.3 Contract (end-to-end HTTP)
- `POST /reports/send` → 202 → poll `GET /reports/send/{key}` → `SUCCEEDED` con `messageId`.
- Reenvío misma clave → 200 inmediato con resultado replay.

---

## 7. Métricas y Observabilidad

- Micrometer counters existentes (`whatsapp.send.total`, `.success`, `.failure`, `.duration`) se mantienen (se ejecutan dentro de `ReportSendService.sendReport`).
- Nuevos: `rabbitmq.publish.duration`, `rabbitmq.consume.duration`, `rabbitmq.dlq.count` (via Micrometer RabbitMQ binder).

---

## 8. Seguridad

- Credenciales RabbitMQ solo via env vars (`.env`, `config-server`); no en código.
- `publisher-confirm-type: correlated` + `publisher-returns: true` para detectar mensajes no enrutables.
- Virtual host dedicado `predicador`.

---

## 9. Compatibilidad y Migración

- **Cero cambios en frontend**: el contrato HTTP (202 + poll GET) es idéntico.
- **Cero cambios en BD**: `WhatsAppDelivery` y `WhatsAppDeliveryStatus` intactos.
- Rollback trivial: desactivar perfil `messaging` en compose → el executor en memoria vuelve a usarse si se elimina la inyección de `RabbitTemplate` (feature flag opcional).

---

## 10. Criterios de Aceptación

1. `docker-compose --profile messaging up -d` levanta RabbitMQ sano (healthcheck OK).
2. `POST /reports/send` devuelve 202 y `IN_PROGRESS` en < 200ms.
3. Mensaje aparece en queue `whatsapp.send` (management UI).
4. Consumer procesa, BD pasa a `SUCCEEDED`, `GET /reports/send/{key}` devuelve `SUCCEEDED` + `messageId`.
5. Fallo 504 → 3 retries con backoff → éxito → BD `SUCCEEDED`.
6. Fallo 400 (token inválido) → sin retry → BD `FAILED` + mensaje en `whatsapp.send.dlq`.
7. Reenvío misma `Idempotency-Key` → 200 replay inmediato (sin publicar en cola).
8. Tests unit + integration + contract pasan en CI (`mvn verify` + `npm test`).

---

## 11. Esquema de Directorios (nuevos/afectados)

```
backend/
├── config-server/src/main/resources/config/reporting-service.yml   # + spring.rabbitmq.*
├── reporting-service/
│   ├── src/main/java/com/predicador/reporting/
│   │   ├── config/RabbitConfig.java                                 # NEW
│   │   ├── service/
│   │   │   ├── WhatsAppSendService.java                             # MOD: publica en RabbitMQ
│   │   │   └── WhatsAppListener.java                                # NEW consumer
│   │   └── ...
│   └── src/test/
│       ├── unit/...RabbitConfigTest.java                            # NEW
│       ├── unit/...WhatsAppSendServiceTest.java                     # MOD
│       ├── unit/...WhatsAppListenerTest.java                        # NEW
│       └── integration/...RabbitMQIntegrationTest.java              # NEW (Testcontainers)
docker-compose.yml                                                    # + rabbitmq service
docs/superpowers/specs/2026-08-03-rabbitmq-whatsapp-sends-design.md # THIS FILE
```

---

## 12. Notas de Implementación (para writing-plans)

- Orden sugerido: infra (compose + config) → RabbitConfig → WhatsAppSendService refactor → Listener → tests.
- Mantener `ReportSendService` intocado (single source of truth para worker).
- Usar `CorrelationData` con `idempotencyKey` como correlationId para publisher confirms.
- En listener, `channel.ack()` solo tras `sendReport` éxito; `nack(requeue=false)` en fallos 4xx.
- Configurar `containerFactory` con `RetryTemplate` y `MessageRecoverer` que mueva a DLQ tras retries agotados.

---

*Fin del spec. Auto-revisión completada. Pendiente revisión de usuario antes de `writing-plans`.*