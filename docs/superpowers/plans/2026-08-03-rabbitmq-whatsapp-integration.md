# RabbitMQ + WhatsApp Reporting Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RabbitMQ message broker to the Spring Boot backend and create a simulation of sending reports from frontend to backend for the WhatsApp API, enabling async report processing via message queues.

**Architecture:** 
- Add RabbitMQ dependency to reporting-service and configure connection via docker-compose
- Create a message publisher in reporting-service that sends report send requests to a RabbitMQ exchange
- Create a message consumer that processes WhatsApp send requests asynchronously
- Update docker-compose.yml to include RabbitMQ service
- Create a simple frontend simulation component to trigger report sends

**Tech Stack:** Spring Boot 4.0, RabbitMQ 3.12, Spring AMQP, Angular 22, TypeScript

## Global Constraints
- Java 25, Spring Boot 4.0.0
- RabbitMQ 3.12-management image
- PostgreSQL/PostGIS (Neon external)
- Session secret must be ≥32 bytes, shared by gateway, territory, reporting
- Flyway migrations versioned per service (territory: flyway_schema_history_territory; reporting: disabled)
- Frontend: Angular 22 SSR/PWA with Vitest/jsdom
- CI order: lint → build → test → build

---

### Task 1: Add RabbitMQ to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: RabbitMQ service on port 5672 (AMQP) and 15672 (Management UI)

- [ ] **Step 1: Add RabbitMQ service to docker-compose.yml**

```yaml
  rabbitmq:
    image: rabbitmq:3.12-management
    container_name: rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_running"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
```

- [ ] **Step 2: Add rabbitmq_data volume to volumes section**

```yaml
volumes:
  prometheus_data:
  grafana_data:
  rabbitmq_data:
```

- [ ] **Step 3: Add RabbitMQ dependencies to reporting-service and territory-service**

```yaml
    environment:
      ...
      - SPRING_RABBITMQ_HOST=rabbitmq
      - SPRING_RABBITMQ_PORT=5672
      - SPRING_RABBITMQ_USERNAME=guest
      - SPRING_RABBITMQ_PASSWORD=guest
```

- [ ] **Step 4: Add depends_on for rabbitmq in reporting-service and territory-service**

```yaml
    depends_on:
      discovery-server:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
```

- [ ] **Step 5: Run docker-compose up --build -d and verify RabbitMQ starts**

Run: `docker-compose up --build -d`
Expected: All 6 services healthy (config-server, discovery-server, api-gateway, territory-service, reporting-service, rabbitmq)

---

### Task 2: Add Spring AMQP dependencies to reporting-service

**Files:**
- Modify: `backend/reporting-service/pom.xml`

**Interfaces:**
- Consumes: RabbitMQ connection properties from docker-compose
- Produces: RabbitTemplate, RabbitListenerContainerFactory beans

- [ ] **Step 1: Add spring-boot-starter-amqp dependency**

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
```

- [ ] **Step 2: Run mvn clean install -pl reporting-service -DskipTests -B**

Run: `mvn clean install -pl reporting-service -DskipTests -B`
Expected: BUILD SUCCESS

---

### Task 3: Create RabbitMQ configuration in reporting-service

**Files:**
- Create: `backend/reporting-service/src/main/java/com/predicador/reporting/config/RabbitMQConfig.java`

**Interfaces:**
- Produces: Queue, Exchange, Binding, RabbitTemplate beans

- [ ] **Step 1: Create RabbitMQConfig class**

```java
package com.predicador.reporting.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String WHATSAPP_SEND_EXCHANGE = "whatsapp.send.exchange";
    public static final String WHATSAPP_SEND_QUEUE = "whatsapp.send.queue";
    public static final String WHATSAPP_SEND_ROUTING_KEY = "whatsapp.send";

    @Bean
    public DirectExchange whatsappSendExchange() {
        return new DirectExchange(WHATSAPP_SEND_EXCHANGE, true, false);
    }

    @Bean
    public Queue whatsappSendQueue() {
        return new Queue(WHATSAPP_SEND_QUEUE, true);
    }

    @Bean
    public Binding whatsappSendBinding(DirectExchange exchange, Queue queue) {
        return BindingBuilder.bind(queue).to(exchange).with(WHATSAPP_SEND_ROUTING_KEY);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        return template;
    }
}
```

- [ ] **Step 2: Run mvn clean compile -pl reporting-service -B**

Run: `mvn clean compile -pl reporting-service -B`
Expected: BUILD SUCCESS

---

### Task 4: Create WhatsApp Send Request DTO for messaging

**Files:**
- Create: `backend/reporting-service/src/main/java/com/predicador/reporting/dto/WhatsAppMessageRequest.java`

**Interfaces:**
- Produces: DTO for RabbitMQ message payload

- [ ] **Step 1: Create WhatsAppMessageRequest record**

```java
package com.predicador.reporting.dto;

import java.util.List;
import java.util.Map;

/**
 * Message payload for RabbitMQ WhatsApp send requests.
 * Sent by controller, consumed by WhatsAppSendListener.
 */
public record WhatsAppMessageRequest(
        String idempotencyKey,
        String destinationNumber,
        String templateName,
        String languageCode,
        List<Map<String, Object>> components
) {}
```

- [ ] **Step 2: Run mvn clean compile -pl reporting-service -B**

Run: `mvn clean compile -pl reporting-service -B`
Expected: BUILD SUCCESS

---

### Task 5: Create WhatsApp Send Publisher

**Files:**
- Create: `backend/reporting-service/src/main/java/com/predicador/reporting/publisher/WhatsAppSendPublisher.java`

**Interfaces:**
- Consumes: RabbitTemplate, RabbitMQConfig constants
- Produces: publish() method for controllers

- [ ] **Step 1: Create WhatsAppSendPublisher service**

```java
package com.predicador.reporting.publisher;

import com.predicador.reporting.config.RabbitMQConfig;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

@Service
public class WhatsAppSendPublisher {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendPublisher.class);

    private final RabbitTemplate rabbitTemplate;

    public WhatsAppSendPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publish(WhatsAppMessageRequest request) {
        log.info("Publicando envío WhatsApp a cola key={}", request.idempotencyKey());
        rabbitTemplate.convertAndSend(
                RabbitMQConfig.WHATSAPP_SEND_EXCHANGE,
                RabbitMQConfig.WHATSAPP_SEND_ROUTING_KEY,
                request
        );
    }
}
```

- [ ] **Step 2: Run mvn clean compile -pl reporting-service -B**

Run: `mvn clean compile -pl reporting-service -B`
Expected: BUILD SUCCESS

---

### Task 6: Create WhatsApp Send Listener (Consumer)

**Files:**
- Create: `backend/reporting-service/src/main/java/com/predicador/reporting/listener/WhatsAppSendListener.java`

**Interfaces:**
- Consumes: WhatsAppSendService, WhatsAppMessageRequest
- Produces: @RabbitListener method

- [ ] **Step 1: Create WhatsAppSendListener**

```java
package com.predicador.reporting.listener;

import com.predicador.reporting.config.RabbitMQConfig;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import com.predicador.reporting.service.WhatsAppSendService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class WhatsAppSendListener {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendListener.class);

    private final WhatsAppSendService whatsAppSendService;

    public WhatsAppSendListener(WhatsAppSendService whatsAppSendService) {
        this.whatsAppSendService = whatsAppSendService;
    }

    @RabbitListener(queues = RabbitMQConfig.WHATSAPP_SEND_QUEUE)
    public void onMessage(WhatsAppMessageRequest request) {
        log.info("Procesando mensaje WhatsApp desde cola key={}", request.idempotencyKey());
        
        // Convert to existing WhatsAppSendRequest
        var sendRequest = new com.predicador.reporting.dto.WhatsAppSendRequest(
                request.destinationNumber(),
                request.templateName(),
                request.languageCode(),
                request.components()
        );
        
        // Submit for async processing (uses existing executor)
        whatsAppSendService.submit(sendRequest, request.idempotencyKey());
    }
}
```

- [ ] **Step 2: Run mvn clean compile -pl reporting-service -B**

Run: `mvn clean compile -pl reporting-service -B`
Expected: BUILD SUCCESS

---

### Task 7: Update ReportController to use RabbitMQ publisher

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java`

**Interfaces:**
- Consumes: WhatsAppSendPublisher, WhatsAppMessageRequest
- Produces: Updated POST /api/v1/reports/whatsapp endpoint

- [ ] **Step 1: Add WhatsAppSendPublisher dependency and publish endpoint**

```java
// Add import
import com.predicador.reporting.publisher.WhatsAppSendPublisher;
import com.predicador.reporting.dto.WhatsAppMessageRequest;

// Add field
private final WhatsAppSendPublisher whatsAppSendPublisher;

// Update constructor
public ReportController(..., WhatsAppSendPublisher whatsAppSendPublisher) {
    this.whatsAppSendPublisher = whatsAppSendPublisher;
}

// Add new endpoint for async WhatsApp send via RabbitMQ
@PostMapping("/whatsapp/async")
public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppAsync(
        @RequestBody WhatsAppSendRequest request,
        @RequestHeader("Idempotency-Key") String idempotencyKey) {
    
    // Publish to RabbitMQ instead of direct processing
    var messageRequest = new WhatsAppMessageRequest(
            idempotencyKey,
            request.destinationNumber(),
            request.templateName(),
            request.languageCode(),
            request.components()
    );
    
    whatsAppSendPublisher.publish(messageRequest);
    
    // Return immediate IN_PROGRESS response
    return ResponseEntity.accepted()
            .body(new WhatsAppDeliveryDto(
                    idempotencyKey,
                    "IN_PROGRESS",
                    null,
                    null));
}
```

- [ ] **Step 2: Run mvn clean compile -pl reporting-service -B**

Run: `mvn clean compile -pl reporting-service -B`
Expected: BUILD SUCCESS

---

### Task 8: Create frontend WhatsApp send simulation component

**Files:**
- Create: `predicador-frontend/src/app/whatsapp-simulation/whatsapp-simulation.component.ts`
- Create: `predicador-frontend/src/app/whatsapp-simulation/whatsapp-simulation.component.html`
- Create: `predicador-frontend/src/app/whatsapp-simulation/whatsapp-simulation.component.scss`

**Interfaces:**
- Consumes: Angular HttpClient, environment config
- Produces: UI component to trigger test WhatsApp sends

- [ ] **Step 1: Create component TypeScript**

```typescript
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface WhatsAppSendRequest {
  destinationNumber: string;
  templateName: string;
  languageCode: string;
  components: Array<Record<string, unknown>>;
}

interface WhatsAppDeliveryResponse {
  idempotencyKey: string;
  status: string;
  messageId: string | null;
  error: string | null;
}

@Component({
  selector: 'app-whatsapp-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-simulation.component.html',
  styleUrls: ['./whatsapp-simulation.component.scss']
})
export class WhatsappSimulationComponent {
  readonly loading = signal(false);
  readonly result = signal<WhatsAppDeliveryResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly statusPolling = signal<string | null>(null);

  readonly destinationNumber = signal('56936577203');
  readonly templateName = signal('asignacion_territorio');
  readonly languageCode = signal('es');

  constructor(private http: HttpClient) {}

  async sendTestReport(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    const idempotencyKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    const request: WhatsAppSendRequest = {
      destinationNumber: this.destinationNumber(),
      templateName: this.templateName(),
      languageCode: this.languageCode(),
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Test Territory' }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Test Address' }] }
      ]
    };

    try {
      const headers = new HttpHeaders()
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey);

      // Use async endpoint
      const response = await this.http.post<WhatsAppDeliveryResponse>(
        `${environment.apiUrl}/api/v1/reports/whatsapp/async`,
        request,
        { headers }
      ).toPromise();

      this.result.set(response ?? null);
      
      // Poll for status
      this.pollStatus(idempotencyKey);
    } catch (err: any) {
      this.error.set(err.error?.detail || err.message || 'Error desconocido');
    } finally {
      this.loading.set(false);
    }
  }

  private async pollStatus(key: string): Promise<void> {
    this.statusPolling.set('Polling...');
    
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      try {
        const response = await this.http.get<WhatsAppDeliveryResponse>(
          `${environment.apiUrl}/api/v1/reports/whatsapp/status/${key}`
        ).toPromise();
        
        if (response && response.status !== 'IN_PROGRESS') {
          this.result.set(response);
          this.statusPolling.set(null);
          return;
        }
      } catch {
        // Ignore polling errors
      }
    }
    
    this.statusPolling.set('Timeout - check manually');
  }
}
```

- [ ] **Step 2: Create component HTML**

```html
<div class="simulation-container">
  <h2>Simulación de Envío WhatsApp</h2>
  
  <div class="form-group">
    <label>Número Destino:</label>
    <input type="text" [(ngModel)]="destinationNumber" placeholder="56936577203" />
  </div>
  
  <div class="form-group">
    <label>Plantilla:</label>
    <input type="text" [(ngModel)]="templateName" placeholder="asignacion_territorio" />
  </div>
  
  <div class="form-group">
    <label>Idioma:</label>
    <input type="text" [(ngModel)]="languageCode" placeholder="es" />
  </div>
  
  <button 
    class="btn-primary" 
    (click)="sendTestReport()" 
    [disabled]="loading()"
  >
    {{ loading() ? 'Enviando...' : 'Enviar Reporte de Prueba' }}
  </button>
  
  @if (statusPolling()) {
    <div class="polling">{{ statusPolling() }}</div>
  }
  
  @if (error()) {
    <div class="error">{{ error() }}</div>
  }
  
  @if (result()) {
    <div class="result">
      <h3>Resultado:</h3>
      <pre>{{ result() | json }}</pre>
    </div>
  }
</div>
```

- [ ] **Step 3: Create component SCSS**

```scss
.simulation-container {
  max-width: 600px;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fafafa;
  
  h2 {
    margin-top: 0;
    color: #333;
  }
  
  .form-group {
    margin-bottom: 1rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    
    input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 1rem;
    }
  }
  
  .btn-primary {
    width: 100%;
    padding: 0.75rem;
    background: #25D366;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
  
  .polling {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
  }
  
  .error {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    color: #721c24;
  }
  
  .result {
    margin-top: 1rem;
    padding: 1rem;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 4px;
    color: #155724;
    
    h3 { margin-top: 0; }
    
    pre {
      background: #fff;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
  }
}
```

---

### Task 9: Add simulation route to frontend

**Files:**
- Modify: `predicador-frontend/src/app/app.routes.ts` (or equivalent routing file)

**Interfaces:**
- Produces: Route for /whatsapp-simulation

- [ ] **Step 1: Add route to app routes**

```typescript
// In app.routes.ts or routing configuration
{
  path: 'whatsapp-simulation',
  loadComponent: () => import('./whatsapp-simulation/whatsapp-simulation.component')
    .then(m => m.WhatsappSimulationComponent),
  title: 'Simulación WhatsApp'
}
```

---

### Task 10: Update environment configuration

**Files:**
- Modify: `predicador-frontend/src/environments/environment.ts`

**Interfaces:**
- Produces: apiUrl pointing to gateway

- [ ] **Step 1: Ensure apiUrl is configured**

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080'
};
```

---

### Task 11: Run full verification

**Files:**
- All modified files

- [ ] **Step 1: Build backend with RabbitMQ**

Run: `cd backend && mvn clean install -DskipTests -B`
Expected: BUILD SUCCESS

- [ ] **Step 2: Start docker-compose with RabbitMQ**

Run: `docker-compose up --build -d`
Expected: All 6 services healthy

- [ ] **Step 3: Verify RabbitMQ management UI**

Run: `curl -u guest:guest http://localhost:15672/api/queues`
Expected: Shows whatsapp.send.queue

- [ ] **Step 4: Build frontend**

Run: `cd predicador-frontend && pnpm run build`
Expected: Build completes

- [ ] **Step 5: Test full flow - send test report via frontend simulation**

1. Start frontend: `pnpm start`
2. Navigate to http://localhost:4200/whatsapp-simulation
3. Click "Enviar Reporte de Prueba"
4. Verify response shows IN_PROGRESS
5. Polling shows final status (DELIVERED or FAILED)

- [ ] **Step 6: Verify message in RabbitMQ queue**

Run: `curl -u guest:guest http://localhost:15672/api/queues/%2F/whatsapp.send.queue`
Expected: Messages published and consumed

- [ ] **Step 7: Run backend tests**

Run: `cd backend && mvn test -pl reporting-service`
Expected: Tests pass

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-03-rabbitmq-whatsapp-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**