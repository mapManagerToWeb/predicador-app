package com.predicador.territory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * Territory microservice entry point.
 *
 * <p>{@code scanBasePackages = "com.predicador"} is required so Spring picks up
 * the shared {@code GlobalExceptionHandler} living in
 * {@code com.predicador.shared.exception}. Without it the advice never
 * registers and every uncaught exception falls back to Spring's default
 * whitelabel response.</p>
 */
@SpringBootApplication(scanBasePackages = "com.predicador")
@EnableDiscoveryClient
public class TerritoryServiceApp {

    public static void main(String[] args) {
        SpringApplication.run(TerritoryServiceApp.class, args);
    }
}
