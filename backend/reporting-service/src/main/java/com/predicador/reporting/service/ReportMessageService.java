package com.predicador.reporting.service;

import com.predicador.reporting.dto.WhatsAppSendRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ReportMessageService {

    public Map<String, String> generarParametrosTemplate(WhatsAppSendRequest request) {
        Map<String, String> params = new LinkedHashMap<>();

        params.put("fecha", request.fechaRegistro());

        String encargado = request.encargadoNombre() + " " + request.encargadoApellido();
        params.put("encargado", encargado);

        String territorios = request.territorios().stream()
            .map(t -> "Territorio " + t.numero() + " " + (t.finalizado() ? "*terminado*" : "*faltante*"))
            .reduce((a, b) -> a + "\n" + b)
            .orElse("");
        params.put("territorio", territorios);

        String predicacion = request.predicacion() != null ? request.predicacion() : "tarde";
        params.put("estado", predicacion);

        return params;
    }

    public boolean requiereScreenshot(WhatsAppSendRequest request) {
        if (request.territorios().size() > 1) return true;
        return request.territorios().stream().anyMatch(t -> !t.finalizado());
    }
}
