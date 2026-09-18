package com.predicador.territory.tile;

import com.predicador.territory.service.TerritoryService;
import org.springframework.stereotype.Component;

/**
 * Resuelve el color de un territorio para las capas MVT usando la MISMA
 * fuente que {@code GET /api/v1/territories/colors}
 * ({@code territory_settings} + paleta por orden de territorio).
 *
 * <p>Históricamente los tiles caían a un gris neutro
 * ({@link TileService#DEFAULT_COLOR}) cuando {@code territory_settings} no
 * tenía fila para el territorio, mientras el endpoint de colores aplicaba
 * la paleta de 18 colores. Eso producía mapas grises aun cuando el backend
 * sí conocía el color. Este resolver cierra esa brecha delegando en
 * {@link TerritoryService#getAllColors()}, que está cacheado y se invalida
 * en {@code assignColor} (PUT color) — por lo que un cambio de color
 * (que además bumpa {@code data_version}) se refleja en los tiles
 * inmediatamente.</p>
 */
@Component
public class TerritoryColorResolver {

    private final TerritoryService territoryService;

    public TerritoryColorResolver(TerritoryService territoryService) {
        this.territoryService = territoryService;
    }

    /**
     * Color asignable del territorio (fila en {@code territory_settings} o
     * asignación de paleta por orden), o {@code null} si el número no está
     * en la lista de territorios distintos del dataset.
     */
    public String colorFor(Long territorioNumero) {
        if (territorioNumero == null) {
            return null;
        }
        return territoryService.getAllColors().get(territorioNumero);
    }
}