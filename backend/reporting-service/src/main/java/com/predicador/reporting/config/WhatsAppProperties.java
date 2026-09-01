package com.predicador.reporting.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "whatsapp")
public record WhatsAppProperties(
    String apiVersion,
    String baseUrl,
    String phoneNumberId,
    String accessToken,
    String templateName,
    String languageCode,
    String destinationNumber,
    String defaultImageUrl
) {}
