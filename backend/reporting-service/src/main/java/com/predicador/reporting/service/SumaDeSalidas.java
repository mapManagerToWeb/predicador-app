package com.predicador.reporting.service;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Suma una salida al estado actual de un territorio (ADR 0013).
 *
 * <p>El estado de un territorio es su último reporte, acumulativo en la vuelta
 * en curso. Antes lo armaba cada teléfono y el último en enviar pisaba a los
 * demás: si su copia estaba vieja (dos hermanos en el mismo territorio, un
 * borrador de días, un ciclo cerrado entretanto) se perdían marcas. Ahora el
 * teléfono manda lo que marcó y el servidor lo suma al estado actual:</p>
 * <ul>
 *   <li>si el último reporte completó o reinició el territorio, empieza una
 *       vuelta nueva (vacía);</li>
 *   <li>manzanas enteras: unión (con los ids numéricos de reportes antiguos
 *       pasados a "territorio-bloque");</li>
 *   <li>calles: por manzana se unen los lados; una manzana entera no guarda
 *       calles y, si con la unión quedan todos sus lados, pasa a entera;</li>
 *   <li>completo cuando todas las manzanas del territorio quedan enteras.</li>
 * </ul>
 * <p>Sumar es idempotente: un teléfono con una versión anterior que manda el
 * estado completo también queda bien.</p>
 */
final class SumaDeSalidas {

    /** Conserva los números tal como vienen (coordenadas sin redondeos ni notación científica). */
    static final ObjectMapper JSON = JsonMapper.builder()
            .nodeFactory(JsonNodeFactory.withExactBigDecimals(true))
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(JsonGenerator.Feature.WRITE_BIGDECIMAL_AS_PLAIN)
            .build();

    private static final String ZONA_ANTIGUA = "Zona parcial";

    /** Calles marcadas de una manzana (m = null: trazo libre de la app anterior). */
    record Zona(String m, String n, List<Integer> l, Integer t, JsonNode g) {}

    record Resultado(List<String> enteras, List<Zona> zonas, boolean completo, int total, int enterasDelTerritorio) {

        String manzanasIds() {
            return String.join(",", enteras);
        }

        String manzanaId() {
            return enteras.isEmpty() ? null : enteras.get(0);
        }

        /** Mismo criterio que la app: manzanas enteras más manzanas con calles. */
        int manzanasMarcadas() {
            return enterasDelTerritorio + zonas.size();
        }

        String geometriaParcial() {
            List<JsonNode> poligonos = new ArrayList<>();
            for (Zona z : zonas) poligonos.addAll(poligonos(z.g()));
            if (poligonos.isEmpty()) return null;
            ObjectNode g = JSON.createObjectNode();
            if (poligonos.size() == 1) {
                g.put("type", "Polygon");
                g.set("coordinates", poligonos.get(0));
            } else {
                g.put("type", "MultiPolygon");
                g.set("coordinates", JSON.createArrayNode().addAll(poligonos));
            }
            return g.toString();
        }

        String puntosParciales() {
            if (zonas.isEmpty()) return null;
            ArrayNode lista = JSON.createArrayNode();
            for (Zona z : zonas) {
                ObjectNode o = lista.addObject();
                if (z.m() == null) o.putNull("m"); else o.put("m", z.m());
                o.put("n", z.n());
                ArrayNode l = o.putArray("l");
                z.l().forEach(l::add);
                if (z.t() != null) o.put("t", z.t());
                o.set("g", z.g());
            }
            ObjectNode detalle = JSON.createObjectNode();
            detalle.put("v", 2);
            detalle.set("zonas", lista);
            return detalle.toString();
        }
    }

    private SumaDeSalidas() {}

    /**
     * @param ultimo    último reporte del territorio (su estado actual), o null
     * @param aporte    lo que manda el teléfono (lo nuevo o, en versiones
     *                  anteriores de la app, el estado completo)
     * @param catalogo  manzanas del territorio: id numérico → "territorio-bloque"
     *                  (vacío si no se pudo leer: se usa el total que manda la app)
     */
    static Resultado sumar(Report ultimo, ReportDto aporte, Map<Long, String> catalogo) {
        Set<String> enteras = new TreeSet<>();
        List<Zona> zonas = new ArrayList<>();
        if (ultimo != null && !empiezaVueltaNueva(ultimo.getEstado())) {
            agregarIds(enteras, ultimo.getManzanasIds(), ultimo.getManzanaId(), catalogo);
            zonas.addAll(leerZonas(ultimo.getGeometriaParcial(), ultimo.getPuntosParciales(), catalogo));
        }
        agregarIds(enteras, aporte.manzanasIds(), aporte.manzanaId(), catalogo);
        zonas.addAll(leerZonas(aporte.geometriaParcial(), aporte.puntosParciales(), catalogo));

        Map<String, Zona> porManzana = new LinkedHashMap<>();
        List<Zona> sinManzana = new ArrayList<>();
        Set<String> vistas = new HashSet<>();
        for (Zona z : zonas) {
            if (z.m() == null) {
                if (vistas.add(z.g().toString())) sinManzana.add(z);
            } else {
                porManzana.merge(z.m(), z, SumaDeSalidas::unir);
            }
        }
        List<Zona> resultado = new ArrayList<>();
        for (Zona z : porManzana.values()) {
            if (enteras.contains(z.m())) continue;
            if (z.t() != null && z.t() > 0 && z.l().size() >= z.t()) {
                enteras.add(z.m());
                continue;
            }
            resultado.add(z);
        }
        resultado.addAll(sinManzana);

        Set<String> delTerritorio = new HashSet<>(catalogo.values());
        int total = delTerritorio.size();
        if (delTerritorio.isEmpty() && aporte.totalManzanas() != null) total = aporte.totalManzanas();
        int enterasDelTerritorio = delTerritorio.isEmpty()
                ? enteras.size()
                : (int) enteras.stream().filter(delTerritorio::contains).count();
        boolean completo = total > 0 && enterasDelTerritorio >= total;
        return new Resultado(List.copyOf(enteras), List.copyOf(resultado), completo, total, enterasDelTerritorio);
    }

    static boolean empiezaVueltaNueva(String estado) {
        return "completed".equals(estado) || Report.ESTADO_REINICIADO.equals(estado);
    }

    /** Ids de manzana de un reporte: "12-12.a" o, en reportes antiguos, el id numérico de la base. */
    private static void agregarIds(Set<String> enteras, String lista, String manzanaId, Map<Long, String> catalogo) {
        List<String> ids = new ArrayList<>();
        if (lista != null) ids.addAll(List.of(lista.split(",")));
        if (manzanaId != null) ids.add(manzanaId);
        for (String id : ids) {
            String limpio = normalizar(id.trim(), catalogo);
            if (limpio != null) enteras.add(limpio);
        }
    }

    private static String normalizar(String id, Map<Long, String> catalogo) {
        if (id == null || id.isEmpty()) return null;
        if (id.chars().allMatch(Character::isDigit)) {
            try {
                return catalogo.getOrDefault(Long.parseLong(id), id);
            } catch (NumberFormatException demasiadoLargo) {
                return id;
            }
        }
        return id;
    }

    /** Igual que {@code leerZonas} de la app (features/map/utils/lados.ts). */
    static List<Zona> leerZonas(String geometriaParcial, String puntosParciales, Map<Long, String> catalogo) {
        JsonNode detalle = parse(puntosParciales);
        if (detalle != null && detalle.path("v").asInt() == 2 && detalle.path("zonas").isArray()) {
            List<Zona> zonas = new ArrayList<>();
            for (JsonNode z : detalle.get("zonas")) {
                JsonNode g = z.get("g");
                if (!esGeometria(g)) continue;
                String m = z.path("m").isTextual() ? normalizar(z.get("m").asText(), catalogo) : null;
                String n = z.path("n").isTextual() ? z.get("n").asText() : ZONA_ANTIGUA;
                List<Integer> l = new ArrayList<>();
                if (z.path("l").isArray()) {
                    for (JsonNode i : z.get("l")) if (i.canConvertToInt() && i.isIntegralNumber()) l.add(i.asInt());
                }
                Integer t = z.path("t").isIntegralNumber() ? z.get("t").asInt() : null;
                zonas.add(new Zona(m, n, new ArrayList<>(new TreeSet<>(l)), t, g));
            }
            return zonas;
        }
        JsonNode g = parse(geometriaParcial);
        if (!esGeometria(g)) return List.of();
        List<Zona> zonas = new ArrayList<>();
        for (JsonNode coordenadas : poligonos(g)) {
            ObjectNode poligono = JSON.createObjectNode();
            poligono.put("type", "Polygon");
            poligono.set("coordinates", coordenadas);
            zonas.add(new Zona(null, ZONA_ANTIGUA, List.of(), null, poligono));
        }
        return zonas;
    }

    /** Dos zonas de la misma manzana: lados unidos; la franja que cubra a la otra o ambas. */
    private static Zona unir(Zona a, Zona b) {
        Set<Integer> lados = new TreeSet<>(a.l());
        lados.addAll(b.l());
        Integer t = a.t();
        if (t == null || (b.t() != null && b.t() > t)) t = b.t();
        JsonNode g;
        if (cubre(b.l(), a.l())) g = b.g();
        else if (cubre(a.l(), b.l())) g = a.g();
        else g = multipoligono(a.g(), b.g());
        return new Zona(a.m(), b.n() != null ? b.n() : a.n(), new ArrayList<>(lados), t, g);
    }

    private static boolean cubre(Collection<Integer> mas, Collection<Integer> menos) {
        return mas.containsAll(menos);
    }

    private static JsonNode multipoligono(JsonNode a, JsonNode b) {
        ObjectNode g = JSON.createObjectNode();
        g.put("type", "MultiPolygon");
        ArrayNode coordenadas = g.putArray("coordinates");
        coordenadas.addAll(poligonos(a));
        coordenadas.addAll(poligonos(b));
        return g;
    }

    private static List<JsonNode> poligonos(JsonNode g) {
        List<JsonNode> lista = new ArrayList<>();
        if ("Polygon".equals(g.path("type").asText())) {
            lista.add(g.get("coordinates"));
        } else {
            g.get("coordinates").forEach(lista::add);
        }
        return lista;
    }

    private static boolean esGeometria(JsonNode g) {
        if (g == null || !g.isObject() || !g.path("coordinates").isArray()) return false;
        String tipo = g.path("type").asText();
        return "Polygon".equals(tipo) || "MultiPolygon".equals(tipo);
    }

    private static JsonNode parse(String texto) {
        if (texto == null || texto.isBlank()) return null;
        try {
            return JSON.readTree(texto);
        } catch (JsonProcessingException ilegible) {
            return null;
        }
    }
}
