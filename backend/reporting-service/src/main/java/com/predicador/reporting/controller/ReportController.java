package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.service.ReportSendService;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

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
        var pageable = PageRequest.of(boundedPage(request.getParameter("page")),
                boundedSize(request.getParameter("size")), Sort.by(Sort.Direction.DESC, "fecha"));
        if (territorioNumero != null) {
            return ResponseEntity.ok(reportService.getReportsByTerritorio(territorioNumero, pageable, token(request)).getContent());
        }
        if (encargadoId != null) {
            return ResponseEntity.ok(reportService.getReportsByEncargado(encargadoId, pageable, token(request)).getContent());
        }
        return ResponseEntity.ok(reportService.getAllReports(pageable, token(request)).getContent());
    }

    @GetMapping("/today")
    public ResponseEntity<List<ReportDto>> getTodayReports(HttpServletRequest request) {
        var pageable = PageRequest.of(boundedPage(request.getParameter("page")),
                boundedSize(request.getParameter("size")), Sort.by(Sort.Direction.DESC, "fecha"));
        return ResponseEntity.ok(reportService.getReportsForToday(pageable, token(request)).getContent());
    }

    @GetMapping("/batch")
    public ResponseEntity<Map<Long, List<ReportDto>>> getReportsBatch(
            @RequestParam List<Long> territorios, HttpServletRequest request) {
        if (territorios.size() > ReportService.MAX_BATCH_SIZE) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(reportService.getReportsByMultipleTerritorios(territorios, token(request)));
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppSendResponse> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        return ResponseEntity.ok(reportSendService.sendReport(request, idempotencyKey));
    }

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SessionAuthFilter.ATTR_TOKEN);
    }

    private int boundedPage(String value) {
        if (value == null) return 0;
        int page = Integer.parseInt(value);
        if (page < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page no puede ser negativo");
        return page;
    }

    private int boundedSize(String value) {
        if (value == null) return 50;
        int size = Integer.parseInt(value);
        if (size < 1 || size > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "size debe estar entre 1 y 100");
        }
        return size;
    }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail handleAuthorization(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getStatusCode(), exception.getReason());
        problem.setTitle("Acceso denegado");
        problem.setType(URI.create("https://api.predicador.com/errors/forbidden"));
        return problem;
    }

    @ExceptionHandler(WhatsAppIntegrationException.class)
    ResponseEntity<ProblemDetail> handleWhatsAppFailure(WhatsAppIntegrationException exception) {
        HttpStatus status = HttpStatus.resolve(exception.status());
        if (status == null || status.is2xxSuccessful()) status = HttpStatus.BAD_GATEWAY;
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
        problem.setTitle("Fallo en la integración WhatsApp");
        problem.setType(URI.create("https://api.predicador.com/errors/whatsapp-integration"));
        return ResponseEntity.status(status).body(problem);
    }
}
