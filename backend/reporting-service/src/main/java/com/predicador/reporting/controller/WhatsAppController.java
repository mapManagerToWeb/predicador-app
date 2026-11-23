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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
public class WhatsAppController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppController.class);

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
        String principal = destino.para(token);
        WhatsAppDeliveryDto delivery = whatsAppSendService.submit(request, idempotencyKey, principal);
        enviarCopia(request, idempotencyKey, token, principal);
        if (WhatsAppDeliveryStatus.IN_PROGRESS.name().equals(delivery.status())) {
            return ResponseEntity.accepted().body(delivery);
        }
        return ResponseEntity.ok(delivery);
    }

    /**
     * La copia al número que eligió el administrador (si hay): con su propia
     * clave, así un reintento de la app tampoco la repite. Si falla, el envío
     * principal sigue igual.
     */
    private void enviarCopia(WhatsAppSendRequest request, String idempotencyKey,
                             com.predicador.shared.security.SessionToken token, String principal) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) return;
        String copia = destino.copiaPara(token, principal);
        if (copia == null) return;
        try {
            whatsAppSendService.submit(request, idempotencyKey + ":copia", copia);
        } catch (RuntimeException e) {
            log.warn("No se pudo encolar la copia del reporte key={} causa={}", idempotencyKey, e.getClass().getSimpleName());
        }
    }

    @GetMapping("/send/{idempotencyKey}")
    public ResponseEntity<WhatsAppDeliveryDto> getSendStatus(
            @PathVariable String idempotencyKey, HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(RequestTokens.token(httpRequest));
        return ResponseEntity.ok(whatsAppSendService.getStatus(idempotencyKey));
    }
}