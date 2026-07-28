package com.predicador.reporting.service;

import com.predicador.reporting.dto.WhatsAppSendRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ReportMessageService {

    public Map<String, String> generarParametrosTemplate(WhatsAppSendRequest request) {
        Map<String, String> params = new LinkedHashMap<>();

        params.put("fecha", clean(request.fechaRegistro()));

        String encargado = request.encargadoNombre() + " " + request.encargadoApellido();
        params.put("encargado", clean(encargado));

        // Meta rechaza los parámetros con saltos de línea/tab o más de 4 espacios seguidos.
        // Usamos " | " como separador visible y compatible.
        String territorios = request.territorios().stream()
            .map(t -> "Territorio " + t.numero() + " " + (t.finalizado() ? "*terminado*" : "*faltante*"))
            .reduce((a, b) -> a + " | " + b)
            .orElse("");
        params.put("territorio", clean(territorios));

        String predicacion = request.predicacion() != null ? request.predicacion() : "tarde";
        params.put("estado", clean(predicacion));

        return params;
    }

    private String clean(String input) {
        if (input == null) return "";
        // Meta prohíbe saltos de línea, tab y > 4 espacios seguidos en parámetros de template.
        // Normalizamos TODOS los whitespace a un espacio simple.
        return input.replace("\n", " ")
                    .replace("\r", " ")
                    .replace("\t", " ")
                    .replaceAll("\\s{2,}", " ")
                    .trim();
    }

    public boolean requiereScreenshot(WhatsAppSendRequest request) {
        if (request.territorios().size() > 1) return true;
        return request.territorios().stream().anyMatch(t -> !t.finalizado());
    }
}
