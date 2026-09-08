package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.reporting.publisher.WhatsAppSendPublisher;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
public class WhatsAppController {

    private final WhatsAppSendService whatsAppSendService;
    private final WhatsAppSendPublisher whatsAppSendPublisher;
    private final AuthorizationService authorization;

    public WhatsAppController(WhatsAppSendService whatsAppSendService,
                              WhatsAppSendPublisher whatsAppSendPublisher,
                              AuthorizationService authorization) {
        this.whatsAppSendService = whatsAppSendService;
        this.whatsAppSendPublisher = whatsAppSendPublisher;
        this.authorization = authorization;
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        WhatsAppDeliveryDto delivery = whatsAppSendService.submit(request, idempotencyKey);
        if (WhatsAppDeliveryStatus.IN_PROGRESS.name().equals(delivery.status())) {
            return ResponseEntity.accepted().body(delivery);
        }
        return ResponseEntity.ok(delivery);
    }

    @GetMapping("/send/{idempotencyKey}")
    public ResponseEntity<WhatsAppDeliveryDto> getSendStatus(
            @PathVariable String idempotencyKey, HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        return ResponseEntity.ok(whatsAppSendService.getStatus(idempotencyKey));
    }

    @PostMapping("/whatsapp/async")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppAsync(
            @Valid @RequestBody WhatsAppMessageRequest request,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        whatsAppSendPublisher.publish(request);
        return ResponseEntity.accepted()
                .body(new WhatsAppDeliveryDto(
                        idempotencyKey,
                        WhatsAppDeliveryStatus.IN_PROGRESS.name(),
                        null,
                        null));
    }

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SecurityConstants.ATTR_TOKEN);
    }
}