package com.predicador.reporting.dto;

public record WhatsAppSendResponse(
    boolean success,
    String messageId,
    String error
) {}
