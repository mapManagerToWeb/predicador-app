package com.predicador.reporting.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

/** Ajuste clave/valor del panel de administración (tabla {@code app_config}, V6). */
@Entity
@Table(name = "app_config")
public class AppConfig {

    @Id
    @Column(name = "clave", length = 100)
    private String clave;

    @Column(name = "valor", nullable = false)
    private String valor;

    @Column(name = "actualizado_en", nullable = false)
    private Instant actualizadoEn;

    protected AppConfig() {
        // Requerido por JPA.
    }

    public AppConfig(String clave, String valor) {
        this.clave = clave;
        this.valor = valor;
    }

    @PrePersist
    @PreUpdate
    void tocar() {
        actualizadoEn = Instant.now();
    }

    public String getClave() { return clave; }
    public String getValor() { return valor; }
    public void setValor(String valor) { this.valor = valor; }
    public Instant getActualizadoEn() { return actualizadoEn; }
}
