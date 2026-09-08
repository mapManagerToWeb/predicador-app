package com.predicador.reporting.config;

import jakarta.annotation.Generated;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Generated("com.predicador.reporting.config.WhatsAppProperties")
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
