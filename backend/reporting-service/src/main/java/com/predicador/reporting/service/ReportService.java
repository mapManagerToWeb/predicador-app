package com.predicador.reporting.service;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private final ReportRepository repository;

    public ReportService(ReportRepository repository) {
        this.repository = repository;
    }

    public List<ReportDto> createReports(List<ReportDto> dtos) {
        return dtos.stream().map(dto -> {
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
            Report saved = repository.save(report);
            return toDto(saved);
        }).collect(Collectors.toList());
    }

    public List<ReportDto> getAllReports() {
        return repository.findAllByOrderByFechaDesc()
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsForToday() {
        LocalDate hoy = LocalDate.now(ZoneOffset.UTC);
        Instant inicio = hoy.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant fin = hoy.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        return repository.findByFechaRange(inicio, fin)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsByTerritorio(Long territorioNumero) {
        return repository.findByTerritorioNumeroOrderByFechaDesc(territorioNumero)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<ReportDto> getReportsByEncargado(Long encargadoId) {
        return repository.findByEncargadoIdOrderByFechaDesc(encargadoId)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
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
