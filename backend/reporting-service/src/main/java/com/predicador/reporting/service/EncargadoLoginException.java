package com.predicador.reporting.service;

import org.springframework.http.HttpStatus;

/**
 * Motivo por el que un encargado no puede entrar. {@code code} es estable y lo
 * usa la app para decidir qué mostrar (pedir el PIN, avisar del bloqueo, etc.).
 */
public class EncargadoLoginException extends RuntimeException {

    public static final String NO_ENCONTRADO = "no_encontrado";
    public static final String INACTIVO = "inactivo";
    public static final String PIN_REQUERIDO = "pin_requerido";
    public static final String PIN_INCORRECTO = "pin_incorrecto";
    public static final String PIN_BLOQUEADO = "pin_bloqueado";
    public static final String REGISTRO_CERRADO = "registro_cerrado";
    public static final String YA_REGISTRADO = "ya_registrado";

    private final HttpStatus status;
    private final String code;

    public EncargadoLoginException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
}
