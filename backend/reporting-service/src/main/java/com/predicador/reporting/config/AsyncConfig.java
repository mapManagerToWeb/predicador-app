package com.predicador.reporting.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Ejecutor acotado para el envío de reportes por WhatsApp en segundo plano.
 * El envío (subida de imagen + plantilla) es lento comparado con el ciclo de
 * request HTTP, así que se desacopla del hilo de la petición para que el
 * gateway no corte la llamada por timeout.
 */
@Configuration
public class AsyncConfig {

    @Bean(name = "whatsAppSendExecutor")
    public Executor whatsAppSendExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("whatsapp-send-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.initialize();
        return executor;
    }
}
