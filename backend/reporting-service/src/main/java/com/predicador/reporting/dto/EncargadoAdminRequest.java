package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Alta o edición de un encargado desde el panel. */
public record EncargadoAdminRequest(
        @NotBlank(message = "nombre es obligatorio")
        @Size(max = 60, message = "nombre demasiado largo")
        String nombre,
        @NotBlank(message = "apellido es obligatorio")
        @Size(max = 60, message = "apellido demasiado largo")
        String apellido,
        @NotBlank(message = "telefono es obligatorio")
        @Pattern(regexp = "^\\+?[0-9 ]{8,18}$", message = "telefono debe contener entre 8 y 15 dígitos")
        String telefono,
        Integer avatar,
        Boolean activo
) {}
