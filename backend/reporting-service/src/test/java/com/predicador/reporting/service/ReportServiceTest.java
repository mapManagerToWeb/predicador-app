package com.predicador.reporting.service;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.shared.security.SessionToken;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    @Mock
    private ReportRepository repository;

    @Mock
    private AuthorizationService authorization;

    private ReportService reportService;

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    @BeforeEach
    void setUp() {
        reportService = new ReportService(repository, new SimpleMeterRegistry(), authorization);
    }

    private Report createReport(Integer id, String manzanaId, String nombre, String apellido,
                                 String sessionTime, String estado, Long territorioNumero) {
        Report report = new Report();
        report.setId(id);
        report.setManzanaId(manzanaId);
        report.setFecha(Instant.now());
        report.setEncargadoNombre(nombre);
        report.setEncargadoApellido(apellido);
        report.setSessionTime(sessionTime);
        report.setEstado(estado);
        report.setTerritorioNumero(territorioNumero);
        return report;
    }

    @Test
    void createReports_shouldCreateAndReturnDtos() {
        ReportDto dto = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L);
        Report saved = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);

        when(repository.saveAll(anyList())).thenReturn(List.of(saved));

        List<ReportDto> result = reportService.createReports(List.of(dto), admin);

        assertEquals(1, result.size());
        assertEquals("Daniel", result.get(0).encargadoNombre());
        assertEquals("Uribe", result.get(0).encargadoApellido());
        assertEquals("morning", result.get(0).sessionTime());
        assertEquals("completed", result.get(0).estado());
        assertEquals(1L, result.get(0).territorioNumero());
        verify(repository, times(1)).saveAll(anyList());
    }

    @Test
    void createReports_shouldHandleMultipleReports() {
        ReportDto dto1 = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L);
        ReportDto dto2 = new ReportDto(null, "2-B", Instant.now(), "Maria", "Lopez", "afternoon", "incomplete", 2L);

        Report saved1 = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        Report saved2 = createReport(2, "2-B", "Maria", "Lopez", "afternoon", "incomplete", 2L);

        when(repository.saveAll(anyList())).thenReturn(List.of(saved1, saved2));

        List<ReportDto> result = reportService.createReports(List.of(dto1, dto2), admin);

        assertEquals(2, result.size());
        verify(repository, times(1)).saveAll(anyList());
    }

    @Test
    void createReports_shouldUseCurrentTimeWhenFechaIsNull() {
        ReportDto dto = new ReportDto(null, "1-A", null, "Daniel", "Uribe", "morning", "completed", 1L);
        Report saved = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);

        when(repository.saveAll(anyList())).thenReturn(List.of(saved));

        List<ReportDto> result = reportService.createReports(List.of(dto), admin);

        assertEquals(1, result.size());
        assertNotNull(result.get(0).fecha());
    }

    @Test
    void getAllReports_shouldReturnAllReports() {
        Report r1 = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        Report r2 = createReport(2, "2-B", "Maria", "Lopez", "afternoon", "incomplete", 2L);

        when(repository.findAllByOrderByFechaDesc()).thenReturn(List.of(r1, r2));

        List<ReportDto> result = reportService.getAllReports(admin);

        assertEquals(2, result.size());
        assertEquals("Daniel", result.get(0).encargadoNombre());
        assertEquals("Maria", result.get(1).encargadoNombre());
    }

    @Test
    void getAllReports_shouldReturnEmptyList() {
        when(repository.findAllByOrderByFechaDesc()).thenReturn(List.of());

        List<ReportDto> result = reportService.getAllReports(admin);

        assertTrue(result.isEmpty());
    }

    @Test
    void getReportsForToday_shouldReturnTodayReports() {
        Report r1 = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);

        when(repository.findByFechaRange(any(Instant.class), any(Instant.class))).thenReturn(List.of(r1));

        List<ReportDto> result = reportService.getReportsForToday(admin);

        assertEquals(1, result.size());
        assertEquals("Daniel", result.get(0).encargadoNombre());
        verify(repository).findByFechaRange(any(Instant.class), any(Instant.class));
    }

    @Test
    void getReportsForToday_shouldReturnEmptyWhenNoReports() {
        when(repository.findByFechaRange(any(Instant.class), any(Instant.class))).thenReturn(List.of());

        List<ReportDto> result = reportService.getReportsForToday(admin);

        assertTrue(result.isEmpty());
    }

    @Test
    void createReports_shouldRejectReportOwnedByAnotherEncargado() {
        ReportDto dto = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L,
                8L, null, null, null, null, null, null);
        SessionToken token = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        doThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "forbidden"))
                .when(authorization).authorizeOwner(token, 8L);

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.createReports(List.of(dto), token));
        verify(repository, never()).saveAll(anyList());
    }

    @Test
    void getReportsByEncargado_shouldAuthorizeRequestedOwner() {
        SessionToken token = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        doThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "forbidden"))
                .when(authorization).authorizeOwner(token, 8L);

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportsByEncargado(8L, token));
        verify(repository, never()).findByEncargadoIdOrderByFechaDesc(8L);
    }

    @Test
    void getAllReports_shouldAllowAdminGlobalOperation() {
        SessionToken token = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
        when(repository.findAllByOrderByFechaDesc()).thenReturn(List.of());

        assertTrue(reportService.getAllReports(token).isEmpty());
    }
}
