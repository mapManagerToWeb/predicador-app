package com.predicador.territory.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.Collection;

/**
 * Mantiene al día los datos derivados de {@code manzanas_territorio} cuando el
 * panel de administración edita manzanas.
 *
 * <p>Las tablas {@code territorio_disuelto}, {@code manzana_s2_cover} y
 * {@code app_meta} las crea la migración de territory {@code V3} del mapa
 * MapLibre. Por eso cada paso comprueba primero que la tabla exista: en una
 * base sin esa migración el editor funciona igual y simplemente no hay nada
 * derivado que refrescar.</p>
 *
 * <ul>
 *   <li>{@code territorio_disuelto}: se recalcula igual que la original,
 *       {@code ST_Multi(ST_Union(ST_Force2D(geometry)))} por territorio.</li>
 *   <li>{@code manzana_s2_cover}: las celdas S2 se calculan fuera de SQL, así
 *       que se borran las filas de las manzanas cambiadas y se marca
 *       {@code s2_backfill_done = 0} para que el backfill las regenere.</li>
 *   <li>{@code app_meta.data_version}: se incrementa para que los clientes
 *       invaliden lo que tengan cacheado.</li>
 * </ul>
 */
@Component
public class DerivedGeometryRefresher {

    private static final Logger log = LoggerFactory.getLogger(DerivedGeometryRefresher.class);

    private final JdbcClient jdbc;

    public DerivedGeometryRefresher(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Refresca los derivados de los territorios y manzanas afectados. Debe
     * llamarse dentro de la misma transacción que la edición.
     */
    public void refresh(Collection<Long> territorios, Collection<Long> manzanasCambiadas) {
        if (!territorios.isEmpty() && tableExists("territorio_disuelto")) {
            jdbc.sql("DELETE FROM territorio_disuelto WHERE territorio_padre IN (:ts)")
                    .param("ts", territorios)
                    .update();
            jdbc.sql("""
                    INSERT INTO territorio_disuelto (territorio_padre, geometry, total_manzanas)
                    SELECT territorio_padre, ST_Multi(ST_Union(ST_Force2D(geometry))), count(*)
                    FROM manzanas_territorio
                    WHERE territorio_padre IN (:ts)
                    GROUP BY territorio_padre
                    """)
                    .param("ts", territorios)
                    .update();
        }

        if (!manzanasCambiadas.isEmpty() && tableExists("manzana_s2_cover")) {
            jdbc.sql("DELETE FROM manzana_s2_cover WHERE manzana_id IN (:ids)")
                    .param("ids", manzanasCambiadas)
                    .update();
        }

        if (tableExists("app_meta")) {
            jdbc.sql("UPDATE app_meta SET v = v + 1 WHERE k = 'data_version'").update();
            if (!manzanasCambiadas.isEmpty()) {
                // Manzanas nuevas o con geometría distinta: su cobertura S2 falta o es vieja.
                jdbc.sql("UPDATE app_meta SET v = 0 WHERE k = 's2_backfill_done'").update();
            }
        }
        log.info("Derivados refrescados: territorios={} manzanas={}", territorios, manzanasCambiadas);
    }

    private boolean tableExists(String table) {
        return Boolean.TRUE.equals(jdbc.sql("SELECT to_regclass(:t) IS NOT NULL")
                .param("t", "public." + table)
                .query(Boolean.class)
                .single());
    }
}
