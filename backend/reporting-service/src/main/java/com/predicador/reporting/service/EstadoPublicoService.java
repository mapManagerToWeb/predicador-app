package com.predicador.reporting.service;

import com.predicador.reporting.dto.EstadoTerritorioPublico;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Estado de todos los territorios para el visor público: el último reporte
 * de cada uno (que es acumulativo: trae todas las manzanas marcadas de la
 * vuelta en curso) y la fecha en que se completó por última vez.
 */
@Service
public class EstadoPublicoService {

    /**
     * Cuándo se trabajó el territorio (ADR 0018): si el encargado informó un
     * día anterior al del envío, el mediodía de ese día (hora de Chile);
     * si no, el momento del envío. {@code fecha} está en UTC, sin zona.
     */
    private static final String CUANDO_SE_TRABAJO = """
            CASE WHEN fecha_predicacion < (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago')::date
                 THEN (fecha_predicacion + time '12:00') AT TIME ZONE 'America/Santiago' AT TIME ZONE 'UTC'
                 ELSE fecha END""";

    private final JdbcClient jdbc;

    public EstadoPublicoService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<EstadoTerritorioPublico> estados() {
        Map<Long, Instant> completados = new HashMap<>();
        jdbc.sql("""
                SELECT territorio_numero, max(%s) AS fecha
                FROM registro_predicacion
                WHERE estado = 'completed' AND territorio_numero IS NOT NULL AND anulado_en IS NULL
                GROUP BY territorio_numero
                """.formatted(CUANDO_SE_TRABAJO))
                .query((rs, n) -> completados.put(rs.getLong("territorio_numero"), instante(rs.getTimestamp("fecha"))))
                .list();

        return jdbc.sql("""
                SELECT DISTINCT ON (territorio_numero)
                       territorio_numero, %s AS trabajo, estado, manzanas_marcadas, total_manzanas,
                       COALESCE(NULLIF(manzanas_ids, ''), manzana_id) AS manzanas_ids, geometria_parcial,
                       puntos_parciales
                FROM registro_predicacion
                WHERE territorio_numero IS NOT NULL AND anulado_en IS NULL
                ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
                """.formatted(CUANDO_SE_TRABAJO))
                .query((rs, n) -> {
                    long territorio = rs.getLong("territorio_numero");
                    return new EstadoTerritorioPublico(
                            territorio,
                            instante(rs.getTimestamp("trabajo")),
                            completados.get(territorio),
                            rs.getString("estado"),
                            (Integer) rs.getObject("manzanas_marcadas"),
                            (Integer) rs.getObject("total_manzanas"),
                            rs.getString("manzanas_ids"),
                            rs.getString("geometria_parcial"),
                            rs.getString("puntos_parciales"));
                })
                .list();
    }

    private static Instant instante(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
