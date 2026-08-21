package com.predicador.reporting.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public class WhatsAppMessageRequest {

    @JsonProperty("idempotencyKey")
    private String idempotencyKey;

    @JsonProperty("destinationNumber")
    private String destinationNumber;

    @JsonProperty("templateName")
    private String templateName;

    @JsonProperty("languageCode")
    private String languageCode;

    @JsonProperty("components")
    private List<Map<String, Object>> components;

    public WhatsAppMessageRequest() {
        // No-arg constructor requerido por Jackson para deserializar el JSON entrante.
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public String getDestinationNumber() {
        return destinationNumber;
    }

    public void setDestinationNumber(String destinationNumber) {
        this.destinationNumber = destinationNumber;
    }

    public String getTemplateName() {
        return templateName;
    }

    public void setTemplateName(String templateName) {
        this.templateName = templateName;
    }

    public String getLanguageCode() {
        return languageCode;
    }

    public void setLanguageCode(String languageCode) {
        this.languageCode = languageCode;
    }

    public List<Map<String, Object>> getComponents() {
        return components;
    }

    public void setComponents(List<Map<String, Object>> components) {
        this.components = components;
    }
}