package com.predicador.reporting.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;

public record WhatsAppMessageRequest(
        @JsonProperty("idempotencyKey") String idempotencyKey,

        @JsonProperty("destinationNumber")
        @NotBlank(message = "destinationNumber es obligatorio")
        @Pattern(regexp = "^\\+[1-9]\\d{1,14}$",
                 message = "destinationNumber debe ser E.164 (ej. +5491100000000)")
        String destinationNumber,

        @JsonProperty("templateName")
        @NotBlank(message = "templateName es obligatorio")
        String templateName,

        @JsonProperty("languageCode") String languageCode,

        @JsonProperty("components") List<Map<String, Object>> components
) {}
