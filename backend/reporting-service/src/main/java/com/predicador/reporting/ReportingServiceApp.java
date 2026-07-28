package com.predicador.reporting;

import com.predicador.reporting.config.WhatsAppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * Reporting microservice entry point.
 *
 * <p>{@code scanBasePackages = "com.predicador"} activates the shared
 * {@code GlobalExceptionHandler} defined in
 * {@code com.predicador.shared.exception} so validation errors and other
 * exceptions are converted into RFC 7807 {@code ProblemDetail} responses.</p>
 */
@SpringBootApplication(scanBasePackages = "com.predicador")
@EnableDiscoveryClient
@EnableConfigurationProperties(WhatsAppProperties.class)
public class ReportingServiceApp {

    public static void main(String[] args) {
        SpringApplication.run(ReportingServiceApp.class, args);
    }
}
