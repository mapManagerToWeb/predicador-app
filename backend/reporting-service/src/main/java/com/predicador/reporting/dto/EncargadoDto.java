package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EncargadoDto(
        Long id,
        @NotBlank(message = "nombre es obligatorio")
        @Size(max = 60, message = "nombre demasiado largo")
        String nombre,
        @Size(max = 60, message = "apellido demasiado largo")
        String apellido,
        Integer avatar,
        // E.164-ish: acepta opcional '+' y de 8 a 15 dígitos. Suficiente para
        // números chilenos con o sin prefijo internacional.
        @Pattern(regexp = "^\\+?[0-9]{8,15}$", message = "telefono debe contener entre 8 y 15 dígitos")
        String telefono,
        Boolean activo
) {}
