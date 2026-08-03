package com.predicador.reporting.dto;

/**
 * Estado de un envío de reporte por WhatsApp, consultado por idempotency key.
 * {@code status} toma los valores del enum {@code WhatsAppDeliveryStatus}
 * (IN_PROGRESS, SUCCEEDED, FAILED).
 */
public record WhatsAppDeliveryDto(
    String idempotencyKey,
    String status,
    String messageId,
    String error
) {}
