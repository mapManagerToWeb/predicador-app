package com.predicador.shared.exception;

public class ResourceNotFoundException extends RuntimeException {

    private final String resource;
    private final Object id;

    public ResourceNotFoundException(String resource, Object id) {
        super(String.format("%s con id %s no encontrado", resource, id));
        this.resource = resource;
        this.id = id;
    }

    public String getResource() {
        return resource;
    }

    public Object getId() {
        return id;
    }
}
