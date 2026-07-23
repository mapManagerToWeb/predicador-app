package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.service.ReportService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @PostMapping
    public ResponseEntity<List<ReportDto>> createReports(@RequestBody List<ReportDto> dtos) {
        return ResponseEntity.ok(reportService.createReports(dtos));
    }

    @GetMapping
    public ResponseEntity<List<ReportDto>> getAllReports() {
        return ResponseEntity.ok(reportService.getAllReports());
    }

    @GetMapping("/today")
    public ResponseEntity<List<ReportDto>> getTodayReports() {
        return ResponseEntity.ok(reportService.getReportsForToday());
    }
}
