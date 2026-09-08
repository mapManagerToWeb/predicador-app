package com.predicador.reporting.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Column;
import java.time.Instant;
import java.time.Duration;

@Entity
@Table(name = "whatsapp_delivery_idempotency")
public class WhatsAppDelivery {
    @Id
    @Column(name = "idempotency_key")
    private String idempotencyKey;
    private boolean success;
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private WhatsAppDeliveryStatus status;
    @Column(name = "message_id")
    private String messageId;
    private String error;
    @Column(name = "status_code")
    private Integer statusCode;
    @Column(name = "lease_until")
    private Instant leaseUntil;
    @Column(name = "created_at")
    private Instant createdAt;

    protected WhatsAppDelivery() {}

    public WhatsAppDelivery(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
        this.createdAt = Instant.now();
        this.status = WhatsAppDeliveryStatus.IN_PROGRESS;
        this.leaseUntil = Instant.now().plus(Duration.ofMinutes(5));
    }

    public static WhatsAppDelivery stale(String idempotencyKey) {
        WhatsAppDelivery delivery = new WhatsAppDelivery(idempotencyKey);
        delivery.leaseUntil = Instant.now().minusSeconds(1);
        return delivery;
    }

    public static WhatsAppDelivery failed(String idempotencyKey, String error, int statusCode) {
        WhatsAppDelivery delivery = new WhatsAppDelivery(idempotencyKey);
        delivery.markFailed(error, statusCode);
        return delivery;
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public Integer getStatusCode() { return statusCode; }
    public WhatsAppDeliveryStatus getStatus() { return status; }
    public Instant getLeaseUntil() { return leaseUntil; }
    public boolean isCompleted() { return status == WhatsAppDeliveryStatus.SUCCEEDED || status == WhatsAppDeliveryStatus.FAILED; }
    public boolean isLeaseActive(Instant now) { return status == WhatsAppDeliveryStatus.IN_PROGRESS && leaseUntil != null && leaseUntil.isAfter(now); }
    public void renewLease(Instant until) { this.leaseUntil = until; }
    public void markSucceeded(String messageId) {
        this.success = true;
        this.status = WhatsAppDeliveryStatus.SUCCEEDED;
        this.messageId = messageId;
        this.error = null;
        this.statusCode = null;
        this.leaseUntil = null;
    }
    public void markFailed(String error, int statusCode) {
        this.success = false;
        this.status = WhatsAppDeliveryStatus.FAILED;
        this.messageId = null;
        this.error = error;
        this.statusCode = statusCode;
        this.leaseUntil = null;
    }
    public Instant getCreatedAt() { return createdAt; }
}
