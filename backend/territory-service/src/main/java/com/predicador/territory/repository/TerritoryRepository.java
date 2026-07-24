package com.predicador.territory.repository;

import com.predicador.territory.model.ManzanaTerritorio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TerritoryRepository extends JpaRepository<ManzanaTerritorio, Long> {

    List<ManzanaTerritorio> findByTerritorioPadreOrderByNombreBloqueAsc(Long territorioPadre);

    @Query("SELECT DISTINCT m.territorioPadre FROM ManzanaTerritorio m WHERE m.territorioPadre IS NOT NULL ORDER BY m.territorioPadre")
    List<Long> findDistinctTerritorioPadres();

    @Query("SELECT m FROM ManzanaTerritorio m WHERE m.territorioPadre IS NOT NULL ORDER BY m.territorioPadre, m.nombreBloque")
    List<ManzanaTerritorio> findAllGroupedByTerritorio();
}
