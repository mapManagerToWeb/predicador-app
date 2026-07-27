package com.predicador.territory.service;

import com.predicador.territory.dto.TerritoryDto;
import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.territory.model.ManzanaTerritorio;
import com.predicador.territory.model.TerritoryColor;
import com.predicador.territory.repository.TerritoryColorRepository;
import com.predicador.territory.repository.TerritoryRepository;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class TerritoryService {

    private final TerritoryRepository territoryRepository;
    private final TerritoryColorRepository colorRepository;

    private static final String[] PALETTE = {
        "#DC143C", "#00A86B", "#007FFF", "#FF6600", "#8A2BE2",
        "#E0115F", "#FFBF00", "#00CED1", "#FF1493", "#32CD32",
        "#FF4500", "#1E90FF", "#DA70D6", "#FFD700", "#00FF7F",
        "#FF00FF", "#4169E1", "#FF69B4", "#7B68EE"
    };

    public TerritoryService(TerritoryRepository territoryRepository, TerritoryColorRepository colorRepository) {
        this.territoryRepository = territoryRepository;
        this.colorRepository = colorRepository;
    }

    public List<Long> getTerritoryNumbers() {
        return territoryRepository.findDistinctTerritorioPadres();
    }

    public TerritoryDto getTerritory(Long number) {
        List<ManzanaTerritorio> manzanas = territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(number);
        if (manzanas.isEmpty()) {
            throw new ResourceNotFoundException("Territorio", number);
        }

        String geoJson = convertToGeoJson(manzanas, number);
        String color = getColorForTerritory(number);
        String name = "Territorio " + number;

        return new TerritoryDto(number, name, geoJson, color);
    }

    public String getTerritoryGeoJson(Long number) {
        List<ManzanaTerritorio> manzanas = territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(number);
        if (manzanas.isEmpty()) {
            throw new ResourceNotFoundException("Territorio", number);
        }
        return convertToGeoJson(manzanas, number);
    }

    public String getAllTerritoriesGeoJson() {
        List<ManzanaTerritorio> allManzanas = territoryRepository.findAllGroupedByTerritorio();
        Map<Long, String> colorMap = getAllColors();

        Map<Long, List<ManzanaTerritorio>> byTerritorio = allManzanas.stream()
                .collect(Collectors.groupingBy(ManzanaTerritorio::getTerritorioPadre, LinkedHashMap::new, Collectors.toList()));

        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"FeatureCollection\",\"features\":[");

        boolean first = true;
        for (Map.Entry<Long, List<ManzanaTerritorio>> entry : byTerritorio.entrySet()) {
            Long number = entry.getKey();
            String color = colorMap.getOrDefault(number, "#3b82f6");

            for (ManzanaTerritorio m : entry.getValue()) {
                double[][] coords = parseWkbHexToCoords(m.getGeometry());
                if (coords == null || coords.length == 0) continue;

                if (!first) sb.append(",");
                first = false;

                appendFeature(sb, number, m.getNombreBloque(), coords);
                injectProperty(sb, "color", escapeJson(color));
                closeFeature(sb);
            }
        }

        sb.append("]}");
        return sb.toString();
    }

    public Map<Long, String> getAllColors() {
        List<TerritoryColor> allColors = colorRepository.findAll();
        Map<Long, String> colorMap = allColors.stream()
                .collect(Collectors.toMap(TerritoryColor::getTerritoryNumber, TerritoryColor::getColor));

        List<Long> numbers = territoryRepository.findDistinctTerritorioPadres();
        Map<Long, String> colors = new LinkedHashMap<>();
        for (int i = 0; i < numbers.size(); i++) {
            Long num = numbers.get(i);
            colors.put(num, colorMap.getOrDefault(num, PALETTE[i % PALETTE.length]));
        }
        return colors;
    }

    public void assignColor(Long territoryNumber, String color) {
        TerritoryColor tc = colorRepository.findById(territoryNumber)
                .orElse(new TerritoryColor());
        tc.setTerritoryNumber(territoryNumber);
        tc.setColor(color);
        colorRepository.save(tc);
    }

    private String getColorForTerritory(Long number) {
        TerritoryColor tc = colorRepository.findById(number).orElse(null);
        if (tc != null) return tc.getColor();
        List<Long> numbers = getTerritoryNumbers();
        int idx = numbers.indexOf(number);
        return PALETTE[Math.max(0, idx) % PALETTE.length];
    }

    private String convertToGeoJson(List<ManzanaTerritorio> manzanas, Long territorioPadre) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"FeatureCollection\",\"features\":[");

        for (int i = 0; i < manzanas.size(); i++) {
            ManzanaTerritorio m = manzanas.get(i);
            if (i > 0) sb.append(",");

            double[][] coords = parseWkbHexToCoords(m.getGeometry());
            if (coords == null || coords.length == 0) continue;

            appendFeature(sb, territorioPadre, m.getNombreBloque(), coords);
            closeFeature(sb);
        }

        sb.append("]}");
        return sb.toString();
    }

    private void appendFeature(StringBuilder sb, Long territorioPadre, String nombreBloque, double[][] coords) {
        sb.append("{\"type\":\"Feature\",");
        sb.append("\"properties\":{");
        sb.append("\"id\":\"").append(territorioPadre).append("-").append(nombreBloque).append("\",");
        sb.append("\"nombre_bloque\":\"").append(escapeJson(nombreBloque)).append("\",");
        sb.append("\"territorio_padre\":").append(territorioPadre);
        sb.append("},");
        sb.append("\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[");

        for (int j = 0; j < coords.length; j++) {
            if (j > 0) sb.append(",");
            sb.append("[").append(coords[j][0]).append(",").append(coords[j][1]).append("]");
        }

        sb.append("]]");
    }

    private void injectProperty(StringBuilder sb, String key, String value) {
        sb.append(",\"").append(key).append("\":\"").append(value).append("\"");
    }

    private void closeFeature(StringBuilder sb) {
        sb.append("}}");
    }

    private double[][] parseWkbHexToCoords(String wkbHex) {
        try {
            byte[] bytes = hexToBytes(wkbHex);
            if (bytes.length < 9) return null;

            int byteOrder = bytes[0];
            int geomType = readInt32(bytes, 1, byteOrder == 0);

            int typeNum = geomType & 0xFF;
            if (typeNum != 3) return null;

            int offset = 5;
            if ((geomType & 0x20000000) != 0) {
                offset = 9;
            }

            boolean hasZ = (geomType & 0x80000000) != 0;
            int coordSize = hasZ ? 3 : 2;

            int numRings = readInt32(bytes, offset, byteOrder == 0);
            offset += 4;

            int numPoints = readInt32(bytes, offset, byteOrder == 0);
            offset += 4;

            double[][] coords = new double[numPoints][2];
            for (int i = 0; i < numPoints; i++) {
                coords[i][0] = readDouble(bytes, offset, byteOrder == 0);
                coords[i][1] = readDouble(bytes, offset + 8, byteOrder == 0);
                offset += coordSize * 8;
            }

            return coords;
        } catch (Exception e) {
            return null;
        }
    }

    private byte[] hexToBytes(String hex) {
        if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.substring(2);
        hex = hex.replaceAll("\\s", "");
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4) + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    private int readInt32(byte[] bytes, int offset, boolean bigEndian) {
        if (bigEndian) {
            return ((bytes[offset] & 0xFF) << 24) | ((bytes[offset + 1] & 0xFF) << 16)
                    | ((bytes[offset + 2] & 0xFF) << 8) | (bytes[offset + 3] & 0xFF);
        } else {
            return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8)
                    | ((bytes[offset + 2] & 0xFF) << 16) | ((bytes[offset + 3] & 0xFF) << 24);
        }
    }

    private double readDouble(byte[] bytes, int offset, boolean bigEndian) {
        long bits;
        if (bigEndian) {
            bits = ((long) bytes[offset] & 0xFF) << 56 | ((long) bytes[offset + 1] & 0xFF) << 48
                    | ((long) bytes[offset + 2] & 0xFF) << 40 | ((long) bytes[offset + 3] & 0xFF) << 32
                    | ((long) bytes[offset + 4] & 0xFF) << 24 | ((long) bytes[offset + 5] & 0xFF) << 16
                    | ((long) bytes[offset + 6] & 0xFF) << 8 | ((long) bytes[offset + 7] & 0xFF);
        } else {
            bits = (bytes[offset] & 0xFF) | ((long) bytes[offset + 1] & 0xFF) << 8
                    | ((long) bytes[offset + 2] & 0xFF) << 16 | ((long) bytes[offset + 3] & 0xFF) << 24
                    | ((long) bytes[offset + 4] & 0xFF) << 32 | ((long) bytes[offset + 5] & 0xFF) << 40
                    | ((long) bytes[offset + 6] & 0xFF) << 48 | ((long) bytes[offset + 7] & 0xFF) << 56;
        }
        return Double.longBitsToDouble(bits);
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }
}
