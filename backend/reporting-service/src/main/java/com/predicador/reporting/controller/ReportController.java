package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.service.ReportSendService;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;
    private final ReportSendService reportSendService;
    private final AuthorizationService authorization;

    public ReportController(ReportService reportService, ReportSendService reportSendService,
                            AuthorizationService authorization) {
        this.reportService = reportService;
        this.reportSendService = reportSendService;
        this.authorization = authorization;
    }

    @PostMapping
    public ResponseEntity<?> createReports(
            @RequestBody @Valid List<@Valid ReportDto> dtos, HttpServletRequest request) {
        if (dtos == null || dtos.isEmpty()) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "La lista de reportes no puede estar vacía");
            problem.setTitle("Datos inválidos");
            problem.setType(URI.create("https://api.predicador.com/errors/bad-request"));
            return ResponseEntity.badRequest().body(problem);
        }
        return ResponseEntity.ok(reportService.createReports(dtos, token(request)));
    }

    @GetMapping
    public ResponseEntity<List<ReportDto>> getAllReports(
            @RequestParam(required = false) Long territorioNumero,
            @RequestParam(required = false) Long encargadoId, HttpServletRequest request) {
        if (territorioNumero != null) {
            return ResponseEntity.ok(reportService.getReportsByTerritorio(territorioNumero, token(request)));
        }
        if (encargadoId != null) {
            return ResponseEntity.ok(reportService.getReportsByEncargado(encargadoId, token(request)));
        }
        return ResponseEntity.ok(reportService.getAllReports(token(request)));
    }

    @GetMapping("/today")
    public ResponseEntity<List<ReportDto>> getTodayReports(HttpServletRequest request) {
        return ResponseEntity.ok(reportService.getReportsForToday(token(request)));
    }

    @GetMapping("/batch")
    public ResponseEntity<Map<Long, List<ReportDto>>> getReportsBatch(
            @RequestParam List<Long> territorios, HttpServletRequest request) {
        return ResponseEntity.ok(reportService.getReportsByMultipleTerritorios(territorios, token(request)));
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppSendResponse> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request, HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        return ResponseEntity.ok(reportSendService.sendReport(request));
    }

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SessionAuthFilter.ATTR_TOKEN);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail handleAuthorization(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getStatusCode(), exception.getReason());
        problem.setTitle("Acceso denegado");
        problem.setType(URI.create("https://api.predicador.com/errors/forbidden"));
        return problem;
    }
}
