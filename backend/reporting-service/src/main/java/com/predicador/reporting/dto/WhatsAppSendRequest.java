package com.predicador.reporting.dto;

import java.util.List;

public record WhatsAppSendRequest(
    String encargadoNombre,
    String encargadoApellido,
    String fechaRegistro,
    String predicacion,
    List<TerritorioReporte> territorios,
    String screenshotBase64,
    String destinationNumber
) {
    public record TerritorioReporte(
        Long numero,
        boolean finalizado,
        int totalManzanas,
        int manzanasMarcadas
    ) {}
}
