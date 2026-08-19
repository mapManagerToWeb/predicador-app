package com.predicador.shared.exception;

import java.io.Serializable;

public class ResourceNotFoundException extends RuntimeException {

    private final String resource;
    private final Serializable id;

    public ResourceNotFoundException(String resource, Serializable id) {
        super(String.format("%s con id %s no encontrado", resource, id));
        this.resource = resource;
        this.id = id;
    }

    public String getResource() {
        return resource;
    }

    public Serializable getId() {
        return id;
    }
}
