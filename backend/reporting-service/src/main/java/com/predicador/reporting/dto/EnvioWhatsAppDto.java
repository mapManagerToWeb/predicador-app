package com.predicador.reporting.dto;

import java.time.Instant;

/** Un envío de WhatsApp, para ver en el panel cuáles fallaron. */
public record EnvioWhatsAppDto(
        String id,
        Instant fecha,
        String estado,
        boolean exito,
        String messageId,
        String error,
        Integer statusCode
) {}
