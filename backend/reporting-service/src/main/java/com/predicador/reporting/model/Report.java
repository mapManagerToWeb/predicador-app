package com.predicador.reporting.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "registro_predicacion")
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "manzana_id", columnDefinition = "TEXT")
    private String manzanaId;

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

    @Column(name = "encargado_id")
    private Long encargadoId;

    @Column(name = "total_manzanas")
    private Integer totalManzanas;

    @Column(name = "manzanas_marcadas")
    private Integer manzanasMarcadas;

    @Column(name = "tipo_sesion")
    private String tipoSesion;

    @Column(name = "geometria_parcial", columnDefinition = "TEXT")
    private String geometriaParcial;

    @Column(name = "puntos_parciales", columnDefinition = "TEXT")
    private String puntosParciales;

    @Column(name = "manzanas_ids", columnDefinition = "TEXT")
    private String manzanasIds;

    @Column(name = "creado_en")
    private Instant creadoEn;

    public Report() {}

    @PrePersist
    protected void onCreate() {
        if (creadoEn == null) creadoEn = Instant.now();
        if (fecha == null) fecha = Instant.now();
    }

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getManzanaId() { return manzanaId; }
    public void setManzanaId(String manzanaId) { this.manzanaId = manzanaId; }

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

    public Long getEncargadoId() { return encargadoId; }
    public void setEncargadoId(Long encargadoId) { this.encargadoId = encargadoId; }

    public Integer getTotalManzanas() { return totalManzanas; }
    public void setTotalManzanas(Integer totalManzanas) { this.totalManzanas = totalManzanas; }

    public Integer getManzanasMarcadas() { return manzanasMarcadas; }
    public void setManzanasMarcadas(Integer manzanasMarcadas) { this.manzanasMarcadas = manzanasMarcadas; }

    public String getTipoSesion() { return tipoSesion; }
    public void setTipoSesion(String tipoSesion) { this.tipoSesion = tipoSesion; }

    public String getGeometriaParcial() { return geometriaParcial; }
    public void setGeometriaParcial(String geometriaParcial) { this.geometriaParcial = geometriaParcial; }

    public String getPuntosParciales() { return puntosParciales; }
    public void setPuntosParciales(String puntosParciales) { this.puntosParciales = puntosParciales; }

    public String getManzanasIds() { return manzanasIds; }
    public void setManzanasIds(String manzanasIds) { this.manzanasIds = manzanasIds; }

    public Integer getManzanasMarcadasCount() { return manzanasMarcadas; }
    public void setManzanasMarcadasCount(Integer manzanasMarcadas) { this.manzanasMarcadas = manzanasMarcadas; }

    public Instant getCreadoEn() { return creadoEn; }
    public void setCreadoEn(Instant creadoEn) { this.creadoEn = creadoEn; }
}
