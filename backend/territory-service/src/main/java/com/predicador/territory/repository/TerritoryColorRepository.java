package com.predicador.territory.repository;

import com.predicador.territory.model.TerritoryColor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TerritoryColorRepository extends JpaRepository<TerritoryColor, Long> {
}
