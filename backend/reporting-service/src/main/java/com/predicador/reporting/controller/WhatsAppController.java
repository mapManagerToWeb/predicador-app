package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
public class WhatsAppController {

    private final WhatsAppSendService whatsAppSendService;
    private final AuthorizationService authorization;

    public WhatsAppController(WhatsAppSendService whatsAppSendService,
                              AuthorizationService authorization) {
        this.whatsAppSendService = whatsAppSendService;
        this.authorization = authorization;
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(RequestTokens.token(httpRequest));
        WhatsAppDeliveryDto delivery = whatsAppSendService.submit(request, idempotencyKey);
        if (WhatsAppDeliveryStatus.IN_PROGRESS.name().equals(delivery.status())) {
            return ResponseEntity.accepted().body(delivery);
        }
        return ResponseEntity.ok(delivery);
    }

    @GetMapping("/send/{idempotencyKey}")
    public ResponseEntity<WhatsAppDeliveryDto> getSendStatus(
            @PathVariable String idempotencyKey, HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(RequestTokens.token(httpRequest));
        return ResponseEntity.ok(whatsAppSendService.getStatus(idempotencyKey));
    }
}