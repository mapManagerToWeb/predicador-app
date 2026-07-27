package com.predicador.reporting;

import com.predicador.reporting.config.WhatsAppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
@EnableConfigurationProperties(WhatsAppProperties.class)
public class ReportingServiceApp {

    public static void main(String[] args) {
        SpringApplication.run(ReportingServiceApp.class, args);
    }
}
