package com.predicador.reporting.config;

<<<<<<< HEAD
=======
import jakarta.annotation.Generated;
>>>>>>> feat/redesign
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
<<<<<<< HEAD
=======
import java.util.concurrent.ThreadPoolExecutor;
>>>>>>> feat/redesign

/**
 * Ejecutor acotado para el envío de reportes por WhatsApp en segundo plano.
 * El envío (subida de imagen + plantilla) es lento comparado con el ciclo de
 * request HTTP, así que se desacopla del hilo de la petición para que el
 * gateway no corte la llamada por timeout.
 */
<<<<<<< HEAD
=======
@Generated("com.predicador.reporting.config.AsyncConfig")
>>>>>>> feat/redesign
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
<<<<<<< HEAD
=======
        // CallerRunsPolicy: cuando la cola está llena, ejecuta la tarea en
        // el hilo del caller en vez de lanzar RejectedExecutionException.
        // Con virtual threads, el caller es un virtual thread que se bloquea
        // sin afectar OS threads.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
>>>>>>> feat/redesign
        executor.initialize();
        return executor;
    }
}
