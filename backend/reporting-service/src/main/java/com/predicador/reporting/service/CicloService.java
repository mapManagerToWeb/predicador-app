package com.predicador.reporting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.dto.EstadoTerritorioAdmin;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
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
        return cerrar(nota, null);
    }

    /**
     * Igual, pero la vuelta nueva empieza el día {@code desde} (en Chile), por
     * ejemplo el inicio de una campaña, aunque se cierre unos días después.
     *
     * <p>Los reinicios se guardan con la hora de ahora (el orden de los
     * reportes no cambia, ADR 0013) y el día {@code desde} como día de trabajo.
     * Por eso no puede haber reportes enviados desde ese día: quedarían antes
     * del reinicio y se perderían de la vuelta nueva. En ese caso se rechaza.</p>
     */
    @Transactional
    public CicloDto cerrar(String nota, LocalDate desde) {
        Instant ahora = Instant.now();
        CicloDto actual = jdbc.sql("SELECT id, inicio, fin, nota, resumen FROM ciclo_territorios WHERE fin IS NULL FOR UPDATE")
                .query(CicloService::ciclo)
                .optional()
                .orElseGet(() -> abrir(ahora.minusSeconds(1)));
        Instant inicioNuevo = desde == null ? ahora : inicioDelDia(desde, actual, ahora);

        List<UltimoReporte> ultimos = ultimosPorTerritorio();
        List<Report> delCiclo = reportes.findByFechaBetweenAndAnuladoEnIsNullOrderByFechaDesc(actual.inicio(), ahora);
        String resumen = resumen(ultimos, delCiclo);

        String motivo = limpiar(nota);
        for (UltimoReporte u : ultimos) {
            if (Report.ORIGEN_REINICIO.equals(u.origen())) continue;
            reportes.save(reinicio(u, ahora, motivo, desde));
        }
        jdbc.sql("UPDATE ciclo_territorios SET fin = :fin, nota = :nota, resumen = :resumen WHERE id = :id")
                .param("fin", Timestamp.from(inicioNuevo))
                .param("nota", motivo)
                .param("resumen", resumen)
                .param("id", actual.id())
                .update();
        return abrir(inicioNuevo);
    }

    /**
     * Resultado de corregir el inicio de la vuelta actual.
     *
     * @param enLaVueltaAnterior reportes enviados entre el nuevo inicio y el
     *                           cierre: quedaron antes del reinicio, o sea en la
     *                           vuelta anterior (si son de esta, hay que anularlos
     *                           y registrarlos de nuevo)
     */
    public record CambioDeInicio(CicloDto ciclo, long enLaVueltaAnterior) {}

    /**
     * Corrige el día en que empezó la vuelta actual (p. ej. se cerró el ciclo
     * hoy, pero la campaña empezó el sábado). No cierra otro ciclo ni toca el
     * orden de los reportes: cambia el inicio del ciclo abierto, el fin del
     * anterior y el día de trabajo de sus reinicios, que es lo que muestra el
     * S-13.
     */
    @Transactional
    public CambioDeInicio cambiarInicio(LocalDate desde) {
        if (desde == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Elige el día en que empezó la vuelta.");
        }
        Instant ahora = Instant.now();
        if (desde.isAfter(DiaDePredicacion.hoy(ahora))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La vuelta no puede empezar en un día futuro.");
        }
        CicloDto actual = jdbc.sql("SELECT id, inicio, fin, nota, resumen FROM ciclo_territorios WHERE fin IS NULL FOR UPDATE")
                .query(CicloService::ciclo)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No hay una vuelta abierta."));
        Optional<CicloDto> anterior = jdbc.sql("""
                SELECT id, inicio, fin, nota, resumen FROM ciclo_territorios
                WHERE fin IS NOT NULL ORDER BY fin DESC, id DESC LIMIT 1 FOR UPDATE
                """)
                .query(CicloService::ciclo)
                .optional();
        Instant inicio = desde.atStartOfDay(DiaDePredicacion.ZONA).toInstant();
        if (anterior.isPresent() && !inicio.isAfter(anterior.get().inicio())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tiene que ser después de que empezó la vuelta anterior.");
        }

        jdbc.sql("UPDATE ciclo_territorios SET inicio = :inicio WHERE id = :id")
                .param("inicio", Timestamp.from(inicio))
                .param("id", actual.id())
                .update();
        long enLaVueltaAnterior = 0;
        if (anterior.isPresent()) {
            jdbc.sql("UPDATE ciclo_territorios SET fin = :fin WHERE id = :id")
                    .param("fin", Timestamp.from(inicio))
                    .param("id", anterior.get().id())
                    .update();
            // Los reinicios del último cierre: todos se guardaron con la misma hora (la del cierre).
            Optional<Instant> ultimoCierre = jdbc.sql("SELECT max(fecha) FROM registro_predicacion WHERE origen = 'reinicio'")
                    .query(Timestamp.class)
                    .list()
                    .stream()
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .map(Timestamp::toInstant);
            ultimoCierre.ifPresent(hora -> jdbc.sql("""
                    UPDATE registro_predicacion SET fecha_predicacion = :dia
                    WHERE origen = 'reinicio' AND fecha = :hora
                    """)
                    .param("dia", desde)
                    .param("hora", Timestamp.from(hora))
                    .update());
            Instant cierre = ultimoCierre.orElse(actual.inicio());
            if (cierre.isAfter(inicio)) {
                enLaVueltaAnterior = jdbc.sql("""
                        SELECT count(*) FROM registro_predicacion
                        WHERE fecha >= :inicio AND fecha < :cierre AND anulado_en IS NULL AND origen <> 'reinicio'
                        """)
                        .param("inicio", Timestamp.from(inicio))
                        .param("cierre", Timestamp.from(cierre))
                        .query(Long.class)
                        .single();
            }
        }
        return new CambioDeInicio(new CicloDto(actual.id(), inicio, null, actual.nota(), actual.resumen()), enLaVueltaAnterior);
    }

    /** Comienzo del día {@code desde} en Chile, validado. */
    private Instant inicioDelDia(LocalDate desde, CicloDto actual, Instant ahora) {
        if (desde.isAfter(DiaDePredicacion.hoy(ahora))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La vuelta nueva no puede empezar en un día futuro.");
        }
        Instant inicio = desde.atStartOfDay(DiaDePredicacion.ZONA).toInstant();
        if (!inicio.isAfter(actual.inicio())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La vuelta actual empezó el " + actual.inicio().atZone(DiaDePredicacion.ZONA).toLocalDate()
                            .format(java.time.format.DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                            + ": la nueva tiene que empezar después. Si lo que quieres es que la vuelta actual"
                            + " empiece antes, usa «Cambiar el día en que empezó».");
        }
        Long posteriores = jdbc.sql("""
                SELECT count(*) FROM registro_predicacion
                WHERE fecha >= :inicio AND anulado_en IS NULL AND origen <> 'reinicio'
                """)
                .param("inicio", Timestamp.from(inicio))
                .query(Long.class)
                .single();
        if (posteriores > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya hay " + posteriores
                    + " reporte(s) enviados desde ese día: quedarían en la vuelta anterior. Elige un día posterior,"
                    + " o anula esos reportes en «Reportes» y regístralos de nuevo después de cerrar.");
        }
        return inicio;
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

    private static Report reinicio(UltimoReporte u, Instant ahora, String nota, LocalDate desde) {
        Report r = new Report();
        r.setTerritorioNumero(u.territorio());
        r.setFecha(ahora);
        r.setFechaPredicacion(desde);
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
                WHERE territorio_numero IS NOT NULL AND anulado_en IS NULL
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
