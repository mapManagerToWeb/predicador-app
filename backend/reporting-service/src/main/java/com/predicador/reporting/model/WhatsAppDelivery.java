package com.predicador.reporting.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Column;
import java.time.Instant;

@Entity
@Table(name = "whatsapp_delivery_idempotency")
public class WhatsAppDelivery {
    @Id
    @Column(name = "idempotency_key")
    private String idempotencyKey;
    private boolean success;
    @Column(name = "message_id")
    private String messageId;
    private String error;
    @Column(name = "created_at")
    private Instant createdAt;

    protected WhatsAppDelivery() {}

    public WhatsAppDelivery(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
        this.createdAt = Instant.now();
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public Instant getCreatedAt() { return createdAt; }
}
