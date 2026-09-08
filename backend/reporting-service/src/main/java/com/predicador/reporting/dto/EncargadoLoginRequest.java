package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record EncargadoLoginRequest(
        @NotBlank(message = "telefono es obligatorio")
        @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$",
                 message = "telefono debe ser E.164 (ej. +5491100000000) o formato local chileno (ej. 56912345678)")
        String telefono
) {}
