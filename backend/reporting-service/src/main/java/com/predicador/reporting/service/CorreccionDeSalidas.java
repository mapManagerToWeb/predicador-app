package com.predicador.reporting.service;

import com.predicador.reporting.dto.CorreccionSalidaRequest;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.dto.ResultadoCorreccionSalida;
import com.predicador.reporting.dto.SalidaAdminDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.shared.exception.ResourceNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * El administrador corrige o anula el reporte de una salida en la que un
 * encargado se equivocó (ADR 0014).
 *
 * <p>No se borra nada: el reporte queda anulado (en el historial, pero no
 * cuenta para el estado, el S-13 ni los informes) y, si se corrige, se guarda
 * en su lugar uno nuevo del mismo encargado y la misma fecha con las marcas
 * correctas. Los reportes que vinieron después en ese territorio llevan el
 * estado acumulado, con el error adentro: se recalculan sumando lo que aportó
 * cada uno (la misma suma de ADR 0013). Una corrección o un cierre de ciclo
 * posterior fijó el estado a mano: desde ahí no se toca.</p>
 */
@Service
public class CorreccionDeSalidas {

    private final ReportRepository reportes;
    private final CatalogoManzanas catalogo;

    public CorreccionDeSalidas(ReportRepository reportes, CatalogoManzanas catalogo) {
        this.reportes = reportes;
        this.catalogo = catalogo;
    }

    @Transactional(readOnly = true)
    public SalidaAdminDto detalle(int id) {
        Report salida = buscar(id);
        List<Report> historia = reportes.findByTerritorioNumeroAndAnuladoEnIsNullOrderByFechaAscIdAsc(salida.getTerritorioNumero());
        Report anterior = null;
        int posteriores = 0;
        for (Report r : historia) {
            if (r.getId().equals(salida.getId())) continue;
            if (antes(r, salida)) anterior = r;
            else posteriores++;
        }
        SalidaAdminDto.EstadoPrevio previo = anterior == null ? null : new SalidaAdminDto.EstadoPrevio(
                anterior.getEstado(), anterior.getManzanasIds(), anterior.getGeometriaParcial(), anterior.getPuntosParciales());
        String encargado = ((salida.getEncargadoNombre() == null ? "" : salida.getEncargadoNombre()) + " "
                + (salida.getEncargadoApellido() == null ? "" : salida.getEncargadoApellido())).trim();
        return new SalidaAdminDto(salida.getId(), salida.getFecha(), encargado, salida.getTerritorioNumero(),
                salida.getOrigen(), salida.getEstado(), salida.getManzanasIds(), salida.getGeometriaParcial(),
                salida.getPuntosParciales(), salida.getTotalManzanas(), salida.getAnuladoEn(), previo, posteriores);
    }

    @Transactional
    public ResultadoCorreccionSalida corregir(int id, CorreccionSalidaRequest req) {
        Report salida = buscar(id);
        if (salida.getAnuladoEn() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese reporte ya estaba anulado.");
        }
        if (!Report.ORIGEN_SALIDA.equals(salida.getOrigen())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se corrigen reportes de salidas. Para el estado actual usa «Corregir un territorio».");
        }
        long territorio = salida.getTerritorioNumero();
        catalogo.bloquear(territorio);
        Map<Long, String> manzanas = catalogo.manzanas(territorio);
        List<Report> historia = reportes.findByTerritorioNumeroAndAnuladoEnIsNullOrderByFechaAscIdAsc(territorio);
        int i = indice(historia, salida);
        Report anterior = i > 0 ? historia.get(i - 1) : null;
        List<Report> despues = historia.subList(i + 1, historia.size());

        String motivo = req.nota() == null || req.nota().isBlank() ? null : req.nota().strip();
        salida.setAnuladoEn(Instant.now());
        salida.setNota(motivo == null ? "Anulado por el administrador" : "Anulado por el administrador: " + motivo);
        reportes.saveAndFlush(salida);

        Report base = anterior;
        Integer reemplazo = null;
        if (!req.anular()) {
            ReportDto corregido = new ReportDto(null, null, null, salida.getEncargadoNombre(), salida.getEncargadoApellido(),
                    null, null, territorio, salida.getEncargadoId(), salida.getTotalManzanas(), null, null,
                    req.geometriaParcial(), req.puntosParciales(), req.manzanasIds());
            Report nuevo = reemplazoDe(salida);
            nuevo.setNota(motivo == null ? "Corregido por el administrador" : "Corregido por el administrador: " + motivo);
            SumaDeSalidas.aplicar(nuevo, SumaDeSalidas.sumar(anterior, corregido, manzanas));
            nuevo = reportes.saveAndFlush(nuevo);
            base = nuevo;
            reemplazo = nuevo.getId();
        }

        int recalculados = 0;
        boolean detenido = false;
        Report previoOriginal = salida;
        for (Report r : despues) {
            if (!Report.ORIGEN_SALIDA.equals(r.getOrigen())) {
                detenido = true;
                break;
            }
            ReportDto aporte = SumaDeSalidas.aporteEntre(previoOriginal, r, manzanas);
            previoOriginal = copiaDelEstado(r);
            SumaDeSalidas.aplicar(r, SumaDeSalidas.sumar(base, aporte, manzanas));
            base = reportes.saveAndFlush(r);
            recalculados++;
        }
        return new ResultadoCorreccionSalida(salida.getId(), reemplazo, recalculados, detenido);
    }

    private Report buscar(int id) {
        return reportes.findById(id).orElseThrow(() -> new ResourceNotFoundException("Reporte", id));
    }

    private static int indice(List<Report> historia, Report salida) {
        for (int i = 0; i < historia.size(); i++) {
            if (historia.get(i).getId().equals(salida.getId())) return i;
        }
        throw new IllegalStateException("El reporte " + salida.getId() + " no está entre los vigentes de su territorio");
    }

    private static boolean antes(Report a, Report b) {
        int porFecha = a.getFecha().compareTo(b.getFecha());
        return porFecha < 0 || (porFecha == 0 && a.getId() < b.getId());
    }

    /** El reporte corregido: mismo encargado, misma fecha (así queda en el mismo lugar del historial). */
    private static Report reemplazoDe(Report salida) {
        Report r = new Report();
        r.setTerritorioNumero(salida.getTerritorioNumero());
        r.setFecha(salida.getFecha());
        r.setSessionTime(salida.getSessionTime());
        r.setInicioSesion(salida.getInicioSesion());
        r.setEncargadoId(salida.getEncargadoId());
        r.setEncargadoNombre(salida.getEncargadoNombre());
        r.setEncargadoApellido(salida.getEncargadoApellido());
        r.setOrigen(Report.ORIGEN_SALIDA);
        r.setReemplazaA(salida.getId());
        return r;
    }

    /** Lo que decía el reporte antes de recalcularlo (para saber qué aportó el siguiente). */
    private static Report copiaDelEstado(Report r) {
        Report c = new Report();
        c.setEstado(r.getEstado());
        c.setManzanasIds(r.getManzanasIds());
        c.setManzanaId(r.getManzanaId());
        c.setGeometriaParcial(r.getGeometriaParcial());
        c.setPuntosParciales(r.getPuntosParciales());
        return c;
    }
}
