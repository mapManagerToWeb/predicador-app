package com.predicador.reporting.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;

public record WhatsAppSendRequest(
    @NotBlank(message = "encargadoNombre es obligatorio")
    String encargadoNombre,
    String encargadoApellido,
    @NotBlank(message = "fechaRegistro es obligatoria")
    String fechaRegistro,
    String predicacion,
    @NotEmpty(message = "territorios no puede estar vacío")
    @Valid
    List<TerritorioReporte> territorios,
    String screenshotBase64,
    String destinationNumber
) {
    public record TerritorioReporte(
        @NotNull(message = "numero de territorio es obligatorio")
        @PositiveOrZero(message = "numero de territorio debe ser >= 0")
        Long numero,
        boolean finalizado,
        @PositiveOrZero(message = "totalManzanas debe ser >= 0")
        int totalManzanas,
        @PositiveOrZero(message = "manzanasMarcadas debe ser >= 0")
        int manzanasMarcadas
    ) {}
}
