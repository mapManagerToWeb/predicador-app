package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.reporting.service.DestinoWhatsApp;
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
    private final DestinoWhatsApp destino;

    public WhatsAppController(WhatsAppSendService whatsAppSendService,
                              AuthorizationService authorization,
                              DestinoWhatsApp destino) {
        this.whatsAppSendService = whatsAppSendService;
        this.authorization = authorization;
        this.destino = destino;
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        var token = RequestTokens.token(httpRequest);
        authorization.requireAuthenticated(token);
        // Le llega al encargado que envía (su teléfono registrado), no al que diga la app.
        WhatsAppDeliveryDto delivery = whatsAppSendService.submit(request, idempotencyKey, destino.para(token));
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