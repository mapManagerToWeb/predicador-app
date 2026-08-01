package com.predicador.reporting.service;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.shared.security.SessionToken;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private final ReportRepository repository;
    private final MeterRegistry registry;
    private final AuthorizationService authorization;

    public ReportService(ReportRepository repository, MeterRegistry registry, AuthorizationService authorization) {
        this.repository = repository;
        this.registry = registry;
        this.authorization = authorization;
    }

    public List<ReportDto> createReports(List<ReportDto> dtos, SessionToken token) {
        dtos.forEach(dto -> authorization.authorizeOwner(token, dto.encargadoId()));
        long start = System.nanoTime();
        try {
            List<Report> reports = dtos.stream().map(this::toEntity).collect(Collectors.toList());
            List<Report> saved = repository.saveAll(reports);
            return saved.stream().map(this::toDto).collect(Collectors.toList());
        } finally {
            long elapsed = System.nanoTime() - start;
            Timer.builder("report.persistence.duration")
                    .description("Tiempo para persistir reportes en base de datos")
                    .register(registry)
                    .record(elapsed, TimeUnit.NANOSECONDS);
        }
    }

    public List<ReportDto> getAllReports(SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findAllByOrderByFechaDesc()
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsForToday(SessionToken token) {
        authorization.requireAdmin(token);
        LocalDate hoy = LocalDate.now(ZoneOffset.UTC);
        Instant inicio = hoy.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant fin = hoy.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        return repository.findByFechaRange(inicio, fin)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsByTerritorio(Long territorioNumero, SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findByTerritorioNumeroOrderByFechaDesc(territorioNumero)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsByEncargado(Long encargadoId, SessionToken token) {
        authorization.authorizeOwner(token, encargadoId);
        return repository.findByEncargadoIdOrderByFechaDesc(encargadoId)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public Map<Long, List<ReportDto>> getReportsByMultipleTerritorios(Collection<Long> territorioNumeros,
                                                                       SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findByTerritorioNumeroInOrderByTerritorioNumeroAscFechaDesc(territorioNumeros)
                .stream()
                .map(this::toDto)
                .collect(Collectors.groupingBy(ReportDto::territorioNumero));
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
        return report;
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
                report.getManzanasIds()
        );
    }
}
