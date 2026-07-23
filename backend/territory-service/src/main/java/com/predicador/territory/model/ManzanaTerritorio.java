package com.predicador.territory.model;

import jakarta.persistence.*;

@Entity
@Table(name = "manzanas_territorio")
public class ManzanaTerritorio {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "territorio_padre")
    private Long territorioPadre;

    @Column(name = "nombre_bloque")
    private String nombreBloque;

    @Column(name = "geometry", columnDefinition = "geometry(GeometryZ,4326)")
    private String geometry;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTerritorioPadre() { return territorioPadre; }
    public void setTerritorioPadre(Long territorioPadre) { this.territorioPadre = territorioPadre; }

    public String getNombreBloque() { return nombreBloque; }
    public void setNombreBloque(String nombreBloque) { this.nombreBloque = nombreBloque; }

    public String getGeometry() { return geometry; }
    public void setGeometry(String geometry) { this.geometry = geometry; }
}
