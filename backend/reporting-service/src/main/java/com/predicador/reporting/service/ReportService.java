package com.predicador.reporting.service;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.shared.security.SessionToken;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class ReportService {

    public static final int MAX_BATCH_SIZE = 100;

    private final ReportRepository repository;
    private final AuthorizationService authorization;
    private final CatalogoManzanas catalogo;
    private final Timer persistenceTimer;

    public ReportService(ReportRepository repository, MeterRegistry registry, AuthorizationService authorization,
                         CatalogoManzanas catalogo) {
        this.repository = repository;
        this.authorization = authorization;
        this.catalogo = catalogo;
        this.persistenceTimer = Timer.builder("report.persistence.duration")
                .description("Tiempo para persistir reportes en base de datos")
                .register(registry);
    }

    @Transactional
    public List<ReportDto> createReports(List<ReportDto> dtos, SessionToken token) {
        if (token != null && token.hasRole(SessionToken.ROLE_ENCARGADO)) {
            try {
                Long tokenEncargadoId = Long.valueOf(token.subject());
                dtos = dtos.stream().map(dto -> {
                    if (dto.encargadoId() == null) {
                        return new ReportDto(
                                dto.id(),
                                dto.manzanaId(),
                                dto.fecha(),
                                dto.encargadoNombre(),
                                dto.encargadoApellido(),
                                dto.sessionTime(),
                                dto.estado(),
                                dto.territorioNumero(),
                                tokenEncargadoId,
                                dto.totalManzanas(),
                                dto.manzanasMarcadas(),
                                dto.tipoSesion(),
                                dto.geometriaParcial(),
                                dto.puntosParciales(),
                                dto.manzanasIds()
                        );
                    }
                    return dto;
                }).collect(Collectors.toList());
            } catch (NumberFormatException ignored) {
                // If token subject is non-numeric, fall through to authorization check
            }
        }
        dtos.forEach(dto -> authorization.authorizeOwner(token, dto.encargadoId()));
        long start = System.nanoTime();
        try {
            // Un envío por territorio a la vez, y los candados siempre en el mismo
            // orden para que dos envíos de varios territorios no se traben.
            dtos.stream().map(ReportDto::territorioNumero).distinct().sorted().forEach(catalogo::bloquear);
            List<ReportDto> guardados = new ArrayList<>();
            for (ReportDto dto : dtos) {
                guardados.add(toDto(repository.saveAndFlush(sumarAlEstado(dto))));
            }
            return guardados;
        } finally {
            long elapsed = System.nanoTime() - start;
            persistenceTimer.record(elapsed, TimeUnit.NANOSECONDS);
        }
    }

    public Page<ReportDto> getAllReports(Pageable pageable, SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findAllByOrderByFechaDesc(pageable).map(this::toDto);
    }

    public Page<ReportDto> getReportsForToday(Pageable pageable, SessionToken token) {
        authorization.requireAdmin(token);
        LocalDate hoy = LocalDate.now(ZoneOffset.UTC);
        Instant inicio = hoy.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant fin = hoy.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        return repository.findByFechaRange(inicio, fin, pageable).map(this::toDto);
    }

    public Page<ReportDto> getReportsByTerritorio(Long territorioNumero, Pageable pageable, SessionToken token) {
        // Cualquier encargado autenticado debe poder leer el progreso de un
        // territorio para restaurar las marcas en el mapa al iniciar sesión.
        authorization.requireAuthenticated(token);
        return repository.findByTerritorioNumeroAndAnuladoEnIsNullOrderByFechaDesc(territorioNumero, pageable).map(this::toDto);
    }

    public Page<ReportDto> getReportsByEncargado(Long encargadoId, Pageable pageable, SessionToken token) {
        authorization.authorizeOwner(token, encargadoId);
        return repository.findByEncargadoIdAndAnuladoEnIsNullOrderByFechaDesc(encargadoId, pageable).map(this::toDto);
    }

    public Map<Long, List<ReportDto>> getReportsByMultipleTerritorios(Collection<Long> territorioNumeros,
                                                                       SessionToken token) {
        authorization.requireAuthenticated(token);
        if (territorioNumeros == null || territorioNumeros.size() > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("El lote de territorios no puede superar " + MAX_BATCH_SIZE);
        }
        return repository.findLatestByTerritorioNumeroIn(territorioNumeros)
                .stream()
                .map(this::toDto)
                .collect(Collectors.groupingBy(ReportDto::territorioNumero));
    }

    public Map<Long, Long> getReportVersions(Collection<Long> territorioNumeros, SessionToken token) {
        authorization.requireAuthenticated(token);
        if (territorioNumeros == null || territorioNumeros.size() > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("El lote de territorios no puede superar " + MAX_BATCH_SIZE);
        }
        return repository.findVersions(territorioNumeros).stream()
                .collect(Collectors.toMap(
                        row -> ((Number) row[0]).longValue(),
                        row -> ((Number) row[1]).longValue(),
                        (first, ignored) -> first));
    }

    /**
     * Elimina reportes recién creados. Se usa como compensación del flujo
     * ACID de "guardar y enviar": si el envío por WhatsApp falla, se revierte
     * la persistencia para que no quede un reporte sin enviar.
     */
    @Transactional
    public void deleteReports(List<Integer> ids, SessionToken token) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("No se indicaron reportes para eliminar");
        }
        List<Report> reports = repository.findAllById(ids);
        for (Report report : reports) {
            authorization.authorizeOwner(token, report.getEncargadoId());
        }
        repository.deleteAll(reports);
    }

    /**
     * El reporte que se guarda es el estado del territorio con la salida
     * sumada (ADR 0013): lo calcula el servidor, no el teléfono. La fecha
     * también es la del servidor (un teléfono con la hora mal no desordena
     * cuál es el último reporte).
     */
    private Report sumarAlEstado(ReportDto dto) {
        long territorio = dto.territorioNumero();
        Report ultimo = repository.findLatestByTerritorioNumeroIn(List.of(territorio)).stream().findFirst().orElse(null);
        SumaDeSalidas.Resultado suma = SumaDeSalidas.sumar(ultimo, dto, catalogo.manzanas(territorio));
        Instant ahora = Instant.now();
        Report report = toEntity(dto);
        report.setFecha(ahora);
        report.setSessionTime(ahora.toString());
        report.setOrigen(Report.ORIGEN_SALIDA);
        SumaDeSalidas.aplicar(report, suma);
        report.setInicioSesion(inicioSesionPlausible(dto.inicioSesion(), ahora));
        return report;
    }

    private Report toEntity(ReportDto dto) {
        Report report = new Report();
        report.setManzanaId(dto.manzanaId());
        report.setFecha(dto.fecha() != null ? dto.fecha() : Instant.now());
        report.setEncargadoNombre(dto.encargadoNombre());
        report.setEncargadoApellido(dto.encargadoApellido());
        report.setSessionTime(dto.sessionTime());
        report.setEstado(dto.estado());
        report.setTerritorioNumero(dto.territorioNumero());
        report.setEncargadoId(dto.encargadoId());
        report.setTotalManzanas(dto.totalManzanas());
        report.setManzanasMarcadas(dto.manzanasMarcadas());
        report.setTipoSesion(dto.tipoSesion());
        report.setGeometriaParcial(dto.geometriaParcial());
        report.setPuntosParciales(dto.puntosParciales());
        report.setManzanasIds(dto.manzanasIds());
        report.setInicioSesion(inicioSesionPlausible(dto.inicioSesion(), report.getFecha()));
        return report;
    }

    /** Máxima duración creíble de una salida; más que eso es un borrador olvidado. */
    static final Duration MAX_DURACION_SESION = Duration.ofHours(12);

    /**
     * Descarta inicios imposibles (posteriores al envío, o de un borrador que
     * quedó abierto días) para que no contaminen el tiempo por manzana.
     */
    static Instant inicioSesionPlausible(Instant inicio, Instant fecha) {
        if (inicio == null || fecha == null) return null;
        if (inicio.isAfter(fecha.plusSeconds(60))) return null;
        if (inicio.isBefore(fecha.minus(MAX_DURACION_SESION))) return null;
        return inicio;
    }

    private ReportDto toDto(Report report) {
        return new ReportDto(
                report.getId(),
                report.getManzanaId(),
                report.getFecha(),
                report.getEncargadoNombre(),
                report.getEncargadoApellido(),
                report.getSessionTime(),
                report.getEstado(),
                report.getTerritorioNumero(),
                report.getEncargadoId(),
                report.getTotalManzanas(),
                report.getManzanasMarcadas(),
                report.getTipoSesion(),
                report.getGeometriaParcial(),
                report.getPuntosParciales(),
                report.getManzanasIds(),
                report.getInicioSesion()
        );
    }
}
