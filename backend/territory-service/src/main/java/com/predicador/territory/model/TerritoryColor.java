package com.predicador.territory.model;

import jakarta.persistence.*;

@Entity
@Table(name = "territory_settings")
public class TerritoryColor {

    @Id
    @Column(name = "territory_number")
    private Long territoryNumber;

    @Column(name = "color", nullable = false, length = 7)
    private String color;

    public Long getTerritoryNumber() { return territoryNumber; }
    public void setTerritoryNumber(Long territoryNumber) { this.territoryNumber = territoryNumber; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
}
