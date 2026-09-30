package com.predicador.reporting.dto;

/**
 * @param anulado      el reporte que quedó sin efecto
 * @param reemplazo    el reporte corregido que se guardó en su lugar (null si se anuló entero)
 * @param recalculados reportes posteriores del territorio que se recalcularon
 * @param detenido     después hubo una corrección o un cierre de ciclo: desde ahí el estado no se tocó
 */
public record ResultadoCorreccionSalida(int anulado, Integer reemplazo, int recalculados, boolean detenido) {}
