package com.predicador.reporting.client;

public class WhatsAppIntegrationException extends RuntimeException {
    private final int status;

    public WhatsAppIntegrationException(String message, int status, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public int status() { return status; }
}
