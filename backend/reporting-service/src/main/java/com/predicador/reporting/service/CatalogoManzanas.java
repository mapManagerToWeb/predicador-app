package com.predicador.reporting.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Lo que la suma de salidas necesita saber de la base compartida (ADR 0013):
 * las manzanas de un territorio y un candado para que dos envíos al mismo
 * territorio se sumen de a uno.
 *
 * <p>Las manzanas son de territory-service ({@code manzanas_territorio}); los
 * dos servicios comparten la base y aquí solo se leen.</p>
 */
@Component
public class CatalogoManzanas {

    private static final Logger log = LoggerFactory.getLogger(CatalogoManzanas.class);

    /** Primera clave del candado: separa estos candados de otros que use la base. */
    private static final int CLAVE_SUMA = 13;

    private final JdbcClient jdbc;

    public CatalogoManzanas(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Manzanas del territorio: id numérico → id "territorio-bloque" (el que usa
     * la app). Vacío si la tabla no está (p. ej. en pruebas): entonces la suma
     * usa el total que manda la app.
     */
    public Map<Long, String> manzanas(long territorio) {
        Map<Long, String> manzanas = new HashMap<>();
        try {
            jdbc.sql("""
                    SELECT id, territorio_padre || '-' || COALESCE(nombre_bloque, '') AS clave
                    FROM manzanas_territorio
                    WHERE territorio_padre = :territorio
                    """)
                    .param("territorio", territorio)
                    .query((rs, n) -> manzanas.put(rs.getLong("id"), rs.getString("clave")))
                    .list();
        } catch (DataAccessException sinTabla) {
            log.warn("No se pudieron leer las manzanas del territorio {}: se usa el total de la app", territorio);
        }
        return manzanas;
    }

    /** Espera a que termine otra suma del mismo territorio (se suelta al terminar la transacción). */
    public void bloquear(long territorio) {
        jdbc.sql("SELECT pg_advisory_xact_lock(:clave, :territorio)")
                .param("clave", CLAVE_SUMA)
                .param("territorio", (int) territorio)
                .query((rs, n) -> 0)
                .list();
    }
}
