package com.predicador.reporting.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "registro_predicacion")
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "manzana_id")
    private Integer manzanaId;

    @Column(name = "fecha")
    private Instant fecha;

    @Column(name = "encargado_nombre")
    private String encargadoNombre;

    @Column(name = "encargado_apellido")
    private String encargadoApellido;

    @Column(name = "session_time")
    private String sessionTime;

    @Column(name = "estado")
    private String estado;

    @Column(name = "territorio_numero")
    private Long territorioNumero;

    public Report() {}

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getManzanaId() { return manzanaId; }
    public void setManzanaId(Integer manzanaId) { this.manzanaId = manzanaId; }

    public Instant getFecha() { return fecha; }
    public void setFecha(Instant fecha) { this.fecha = fecha; }

    public String getEncargadoNombre() { return encargadoNombre; }
    public void setEncargadoNombre(String encargadoNombre) { this.encargadoNombre = encargadoNombre; }

    public String getEncargadoApellido() { return encargadoApellido; }
    public void setEncargadoApellido(String encargadoApellido) { this.encargadoApellido = encargadoApellido; }

    public String getSessionTime() { return sessionTime; }
    public void setSessionTime(String sessionTime) { this.sessionTime = sessionTime; }

    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }

    public Long getTerritorioNumero() { return territorioNumero; }
    public void setTerritorioNumero(Long territorioNumero) { this.territorioNumero = territorioNumero; }
}
