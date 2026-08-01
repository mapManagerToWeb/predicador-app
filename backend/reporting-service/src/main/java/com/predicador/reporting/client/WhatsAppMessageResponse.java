package com.predicador.reporting.client;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record WhatsAppMessageResponse(List<Message> messages,
                                      @JsonProperty("message_id") String messageId) {
    public record Message(String id) {}

    public String stableMessageId() {
        if (messages != null && !messages.isEmpty()) return messages.get(0).id();
        return messageId;
    }
}
