package com.predicador.territory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request payload for {@code PUT /api/v1/territories/{number}/color}.
 *
 * <p>Using a typed DTO with Bean Validation replaces the previous manual
 * regex check in the controller and lets {@code GlobalExceptionHandler}
 * translate malformed input into a proper {@link org.springframework.http.ProblemDetail}.</p>
 */
public record TerritoryColorRequest(
        @NotBlank(message = "color es obligatorio")
        @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "color debe tener formato #RRGGBB")
        String color
) {}
