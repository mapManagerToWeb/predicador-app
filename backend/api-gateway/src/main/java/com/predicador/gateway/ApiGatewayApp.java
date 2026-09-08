package com.predicador.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Gateway entry point. Uses {@code scanBasePackages = "com.predicador"} to
 * pick up shared components ({@code SessionTokenService}, exception advice).
 */
@SpringBootApplication(scanBasePackages = "com.predicador")
public class ApiGatewayApp {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApp.class, args);
    }
}
