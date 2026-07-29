package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.service.ReportSendService;
import com.predicador.reporting.service.ReportService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;
    private final ReportSendService reportSendService;

    public ReportController(ReportService reportService, ReportSendService reportSendService) {
        this.reportService = reportService;
        this.reportSendService = reportSendService;
    }

    @PostMapping
    public ResponseEntity<?> createReports(
            @RequestBody @Valid List<@Valid ReportDto> dtos) {
        if (dtos == null || dtos.isEmpty()) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "La lista de reportes no puede estar vacía");
            problem.setTitle("Datos inválidos");
            problem.setType(URI.create("https://api.predicador.com/errors/bad-request"));
            return ResponseEntity.badRequest().body(problem);
        }
        return ResponseEntity.ok(reportService.createReports(dtos));
    }

    @GetMapping
    public ResponseEntity<List<ReportDto>> getAllReports(
            @RequestParam(required = false) Long territorioNumero,
            @RequestParam(required = false) Long encargadoId) {
        if (territorioNumero != null) {
            return ResponseEntity.ok(reportService.getReportsByTerritorio(territorioNumero));
        }
        if (encargadoId != null) {
            return ResponseEntity.ok(reportService.getReportsByEncargado(encargadoId));
        }
        return ResponseEntity.ok(reportService.getAllReports());
    }

    @GetMapping("/today")
    public ResponseEntity<List<ReportDto>> getTodayReports() {
        return ResponseEntity.ok(reportService.getReportsForToday());
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppSendResponse> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request) {
        return ResponseEntity.ok(reportSendService.sendReport(request));
    }
}
