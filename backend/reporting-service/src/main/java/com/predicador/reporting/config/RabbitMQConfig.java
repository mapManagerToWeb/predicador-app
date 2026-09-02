package com.predicador.reporting.config;

import com.fasterxml.jackson.databind.ObjectMapper;
<<<<<<< HEAD
=======
import jakarta.annotation.Generated;
>>>>>>> feat/redesign
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

<<<<<<< HEAD
=======
@Generated("com.predicador.reporting.config.RabbitMQConfig")
>>>>>>> feat/redesign
@Configuration
public class RabbitMQConfig {

    public static final String WHATSAPP_SEND_EXCHANGE = "whatsapp.send.exchange";
    public static final String WHATSAPP_SEND_QUEUE = "whatsapp.send.queue";
    public static final String WHATSAPP_SEND_ROUTING_KEY = "whatsapp.send";

    @Bean
    public DirectExchange whatsappSendExchange() {
        return new DirectExchange(WHATSAPP_SEND_EXCHANGE, true, false);
    }

    @Bean
    public Queue whatsappSendQueue() {
        return new Queue(WHATSAPP_SEND_QUEUE, true);
    }

    @Bean
    public Binding whatsappSendBinding(DirectExchange exchange, Queue queue) {
        return BindingBuilder.bind(queue).to(exchange).with(WHATSAPP_SEND_ROUTING_KEY);
    }

    @Bean
    public MessageConverter jsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        return template;
    }
}