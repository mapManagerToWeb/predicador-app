package com.predicador.reporting.dto;

import java.util.List;

/**
 * Carga de una lista de hermanos desde el panel (p. ej. pegada desde Excel).
 *
 * <p>Con {@code simular = true} solo se revisa la lista y no se guarda nada:
 * el panel muestra qué pasaría con cada fila antes de confirmar.</p>
 */
public final class ImportacionEncargados {

    private ImportacionEncargados() {}

    public record Fila(String nombre, String apellido, String telefono) {}

    public record Pedido(List<Fila> filas, boolean simular) {}

    /**
     * Qué pasa (o pasó) con una fila.
     *
     * @param fila      número de fila en la lista (desde 1)
     * @param resultado {@code crear} (se crea), {@code existe} (ya estaba: se deja igual) o {@code error}
     */
    public record Resultado(int fila, String nombre, String apellido, String telefono, String resultado, String detalle) {}
}
