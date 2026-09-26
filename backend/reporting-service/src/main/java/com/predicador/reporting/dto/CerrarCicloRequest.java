package com.predicador.reporting.dto;

import jakarta.validation.constraints.Size;

/** Cierre del ciclo en curso; la nota queda guardada con el informe. */
public record CerrarCicloRequest(@Size(max = 500) String nota) {}
