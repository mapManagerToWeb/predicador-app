package com.predicador.reporting.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "encargados")
public class Encargado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nombre", nullable = false, length = 100)
    private String nombre;

    @Column(name = "apellido", nullable = false, length = 100)
    private String apellido;

    @Column(name = "avatar")
    private Integer avatar;

    @Column(name = "telefono", length = 20)
    private String telefono;

    @Column(name = "activo")
    private Boolean activo;

    @Column(name = "creado_en")
    private Instant creadoEn;

    @Column(name = "actualizado_en")
    private Instant actualizadoEn;

    public Encargado() {
        // No-arg constructor requerido por JPA.
    }

    @PrePersist
    protected void onCreate() {
        creadoEn = Instant.now();
        actualizadoEn = Instant.now();
        if (activo == null) activo = true;
        if (avatar == null) avatar = 1;
    }

    @PreUpdate
    protected void onUpdate() {
        actualizadoEn = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }

    public String getApellido() { return apellido; }
    public void setApellido(String apellido) { this.apellido = apellido; }

    public Integer getAvatar() { return avatar; }
    public void setAvatar(Integer avatar) { this.avatar = avatar; }

    public String getTelefono() { return telefono; }
    public void setTelefono(String telefono) { this.telefono = telefono; }

    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean activo) { this.activo = activo; }

    public Instant getCreadoEn() { return creadoEn; }
    public void setCreadoEn(Instant creadoEn) { this.creadoEn = creadoEn; }

    public Instant getActualizadoEn() { return actualizadoEn; }
    public void setActualizadoEn(Instant actualizadoEn) { this.actualizadoEn = actualizadoEn; }
}
