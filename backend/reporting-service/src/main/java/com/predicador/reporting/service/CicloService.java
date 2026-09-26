package com.predicador.reporting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.dto.EstadoTerritorioAdmin;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

/**
 * Ciclos de territorios y correcciones del administrador.
 *
 * <p>El estado de un territorio es siempre su último reporte. Por eso cerrar
 * un ciclo o corregir un territorio no borra nada: agrega un reporte (de
 * origen {@code reinicio} o {@code correccion}) con el nuevo estado, y el
 * historial queda completo para el S-13 y los informes.</p>
 */
@Service
public class CicloService {

    static final String ADMIN = "Administrador";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcClient jdbc;
    private final ReportRepository reportes;

    public CicloService(JdbcClient jdbc, ReportRepository reportes) {
        this.jdbc = jdbc;
        this.reportes = reportes;
    }

    @Transactional(readOnly = true)
    public List<CicloDto> listar() {
        return jdbc.sql("SELECT id, inicio, fin, nota, resumen FROM ciclo_territorios ORDER BY inicio DESC, id DESC")
                .query(CicloService::ciclo)
                .list();
    }

    /**
     * Cierra el ciclo en curso: guarda un resumen de cada territorio, lo
     * vuelve a empezar (reporte de reinicio) y abre un ciclo nuevo.
     */
    @Transactional
    public CicloDto cerrar(String nota) {
        Instant ahora = Instant.now();
        CicloDto actual = jdbc.sql("SELECT id, inicio, fin, nota, resumen FROM ciclo_territorios WHERE fin IS NULL FOR UPDATE")
                .query(CicloService::ciclo)
                .optional()
                .orElseGet(() -> abrir(ahora.minusSeconds(1)));

        List<UltimoReporte> ultimos = ultimosPorTerritorio();
        List<Report> delCiclo = reportes.findByFechaBetweenOrderByFechaDesc(actual.inicio(), ahora);
        String resumen = resumen(ultimos, delCiclo);

        String motivo = limpiar(nota);
        for (UltimoReporte u : ultimos) {
            if (Report.ORIGEN_REINICIO.equals(u.origen())) continue;
            reportes.save(reinicio(u, ahora, motivo));
        }
        jdbc.sql("UPDATE ciclo_territorios SET fin = :fin, nota = :nota, resumen = :resumen WHERE id = :id")
                .param("fin", Timestamp.from(ahora))
                .param("nota", motivo)
                .param("resumen", resumen)
                .param("id", actual.id())
                .update();
        return abrir(ahora);
    }

    /** Último reporte del territorio (su estado actual), si tiene alguno. */
    @Transactional(readOnly = true)
    public Optional<EstadoTerritorioAdmin> estadoActual(long territorio) {
        return reportes.findLatestByTerritorioNumeroIn(List.of(territorio)).stream().findFirst().map(r ->
                new EstadoTerritorioAdmin(territorio, r.getFecha(), r.getEstado(), r.getOrigen(),
                        (nulo(r.getEncargadoNombre()) + " " + nulo(r.getEncargadoApellido())).trim(),
                        r.getManzanasIds() == null || r.getManzanasIds().isBlank() ? r.getManzanaId() : r.getManzanasIds(),
                        r.getGeometriaParcial(), r.getPuntosParciales(), r.getTotalManzanas()));
    }

    /** Fija el estado actual de un territorio (p. ej. desmarcar una manzana marcada por error). */
    @Transactional
    public Report corregir(CorreccionRequest req) {
        Set<String> ids = new LinkedHashSet<>();
        for (String id : (req.manzanasIds() == null ? "" : req.manzanasIds()).split(",")) {
            if (!id.isBlank()) ids.add(id.trim());
        }
        boolean completo = req.totalManzanas() > 0 && ids.size() >= req.totalManzanas();
        Instant ahora = Instant.now();
        Report r = new Report();
        r.setTerritorioNumero(req.territorio());
        r.setFecha(ahora);
        r.setSessionTime(ahora.toString());
        r.setEncargadoNombre(ADMIN);
        r.setEncargadoApellido("");
        r.setEstado(completo ? "completed" : "incomplete");
        r.setTipoSesion(Report.ORIGEN_CORRECCION);
        r.setOrigen(Report.ORIGEN_CORRECCION);
        r.setManzanasIds(String.join(",", ids));
        r.setManzanaId(ids.isEmpty() ? null : ids.iterator().next());
        r.setTotalManzanas(req.totalManzanas());
        r.setManzanasMarcadas(req.manzanasMarcadas());
        r.setGeometriaParcial(vacioANull(req.geometriaParcial()));
        r.setPuntosParciales(vacioANull(req.puntosParciales()));
        r.setNota(limpiar(req.nota()));
        return reportes.save(r);
    }

    private CicloDto abrir(Instant inicio) {
        Long id = jdbc.sql("INSERT INTO ciclo_territorios (inicio) VALUES (:inicio) RETURNING id")
                .param("inicio", Timestamp.from(inicio))
                .query(Long.class)
                .single();
        return new CicloDto(id, inicio, null, null, null);
    }

    private static Report reinicio(UltimoReporte u, Instant ahora, String nota) {
        Report r = new Report();
        r.setTerritorioNumero(u.territorio());
        r.setFecha(ahora);
        r.setSessionTime(ahora.toString());
        r.setEncargadoNombre(ADMIN);
        r.setEncargadoApellido("");
        r.setEstado(Report.ESTADO_REINICIADO);
        r.setTipoSesion(Report.ORIGEN_REINICIO);
        r.setOrigen(Report.ORIGEN_REINICIO);
        r.setManzanasIds("");
        r.setManzanasMarcadas(0);
        r.setTotalManzanas(u.totalManzanas());
        r.setNota(nota);
        return r;
    }

    private record UltimoReporte(long territorio, String estado, String origen, Integer manzanasMarcadas, Integer totalManzanas) {}

    private List<UltimoReporte> ultimosPorTerritorio() {
        return jdbc.sql("""
                SELECT DISTINCT ON (territorio_numero)
                       territorio_numero, estado, origen, manzanas_marcadas, total_manzanas
                FROM registro_predicacion
                WHERE territorio_numero IS NOT NULL
                ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
                """)
                .query((rs, n) -> new UltimoReporte(rs.getLong("territorio_numero"), rs.getString("estado"),
                        rs.getString("origen"), (Integer) rs.getObject("manzanas_marcadas"),
                        (Integer) rs.getObject("total_manzanas")))
                .list();
    }

    /**
     * Resumen por territorio para el informe del ciclo: cómo quedó, cuántas
     * veces se completó, cuándo se trabajó y quiénes. Se guarda al cerrar para
     * que el informe no cambie aunque después se borren reportes.
     */
    static String resumen(List<UltimoReporte> ultimos, List<Report> delCiclo) {
        Map<Long, Map<String, Object>> porTerritorio = new TreeMap<>();
        for (UltimoReporte u : ultimos) {
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("territorio", u.territorio());
            t.put("estado", u.estado());
            t.put("manzanasMarcadas", u.manzanasMarcadas());
            t.put("totalManzanas", u.totalManzanas());
            t.put("completado", new ArrayList<String>());
            t.put("primeraSalida", null);
            t.put("ultimaSalida", null);
            t.put("encargados", new ArrayList<String>());
            porTerritorio.put(u.territorio(), t);
        }
        List<Report> cronologico = new ArrayList<>(delCiclo);
        cronologico.sort((a, b) -> a.getFecha().compareTo(b.getFecha()));
        for (Report r : cronologico) {
            Map<String, Object> t = porTerritorio.get(r.getTerritorioNumero());
            if (t == null || Report.ORIGEN_REINICIO.equals(r.getOrigen())) continue;
            if ("completed".equals(r.getEstado())) lista(t, "completado").add(r.getFecha().toString());
            if (!Report.ORIGEN_SALIDA.equals(r.getOrigen())) continue;
            if (t.get("primeraSalida") == null) t.put("primeraSalida", r.getFecha().toString());
            t.put("ultimaSalida", r.getFecha().toString());
            String nombre = (nulo(r.getEncargadoNombre()) + " " + nulo(r.getEncargadoApellido())).trim();
            if (!nombre.isEmpty() && !lista(t, "encargados").contains(nombre)) lista(t, "encargados").add(nombre);
        }
        try {
            return JSON.writeValueAsString(porTerritorio.values());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo armar el resumen del ciclo", e);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> lista(Map<String, Object> t, String clave) {
        return (List<String>) t.get(clave);
    }

    private static CicloDto ciclo(ResultSet rs, int n) throws SQLException {
        Timestamp fin = rs.getTimestamp("fin");
        return new CicloDto(rs.getLong("id"), rs.getTimestamp("inicio").toInstant(), fin == null ? null : fin.toInstant(),
                rs.getString("nota"), rs.getString("resumen"));
    }

    private static String limpiar(String nota) {
        return nota == null || nota.isBlank() ? null : nota.strip();
    }

    private static String vacioANull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static String nulo(String s) {
        return s == null ? "" : s;
    }
}
