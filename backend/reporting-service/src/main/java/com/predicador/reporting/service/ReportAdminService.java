package com.predicador.reporting.service;

import com.predicador.reporting.dto.EnvioWhatsAppDto;
import com.predicador.reporting.dto.ReporteAdminDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** Lecturas y correcciones de reportes para el panel de administración. */
@Service
public class ReportAdminService {

    /** Rango máximo por consulta: suficiente para comparar varios años. */
    static final Duration RANGO_MAXIMO = Duration.ofDays(3660);
    static final long MAX_REPORTES = 50_000;
    static final int MAX_BORRADO = 500;

    private final ReportRepository reportes;
    private final WhatsAppDeliveryRepository envios;

    public ReportAdminService(ReportRepository reportes, WhatsAppDeliveryRepository envios) {
        this.reportes = reportes;
        this.envios = envios;
    }

    @Transactional(readOnly = true)
    public List<ReporteAdminDto> listar(Instant desde, Instant hasta) {
        if (!desde.isBefore(hasta)) {
            throw new IllegalArgumentException("'desde' debe ser anterior a 'hasta'");
        }
        if (Duration.between(desde, hasta).compareTo(RANGO_MAXIMO) > 0) {
            throw new IllegalArgumentException("El rango máximo es de 10 años");
        }
        if (reportes.countByFechaBetween(desde, hasta) > MAX_REPORTES) {
            throw new IllegalArgumentException("Demasiados reportes en el rango; elegí un período más corto");
        }
        return reportes.findByFechaBetweenOrderByFechaDesc(desde, hasta).stream().map(this::toDto).toList();
    }

    /** Borra reportes cargados por error (duplicados, pruebas). */
    @Transactional
    public int eliminar(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("Indicá al menos un reporte");
        }
        if (ids.size() > MAX_BORRADO) {
            throw new IllegalArgumentException("Máximo " + MAX_BORRADO + " reportes por vez");
        }
        List<Report> encontrados = reportes.findAllById(ids);
        reportes.deleteAll(encontrados);
        return encontrados.size();
    }

    @Transactional(readOnly = true)
    public List<EnvioWhatsAppDto> enviosRecientes() {
        return envios.findTop200ByOrderByCreatedAtDesc().stream()
                .map(d -> new EnvioWhatsAppDto(d.getIdempotencyKey(), d.getCreatedAt(),
                        d.getStatus() != null ? d.getStatus().name() : null, d.isSuccess(), d.getMessageId(),
                        d.getError(), d.getStatusCode()))
                .toList();
    }

    private ReporteAdminDto toDto(Report r) {
        return new ReporteAdminDto(r.getId(), r.getFecha(), r.getInicioSesion(), r.getEncargadoId(),
                r.getEncargadoNombre(), r.getEncargadoApellido(), r.getTerritorioNumero(), r.getEstado(),
                r.getTipoSesion(), r.getTotalManzanas(), r.getManzanasMarcadas(), r.getManzanasIds(),
                r.getGeometriaParcial() != null && !r.getGeometriaParcial().isBlank());
    }
}
