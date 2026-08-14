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
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    @Mock
    private ReportRepository repository;

    private ReportService reportService;

    private final AuthorizationService authorization = new AuthorizationService();

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    private final PageRequest pageable = PageRequest.of(0, 50, Sort.by(Sort.Direction.DESC, "fecha"));

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

        when(repository.findAllByOrderByFechaDesc(pageable)).thenReturn(new PageImpl<>(List.of(r1, r2)));

        List<ReportDto> result = reportService.getAllReports(pageable, admin).getContent();

        assertEquals(2, result.size());
        assertEquals("Daniel", result.get(0).encargadoNombre());
        assertEquals("Maria", result.get(1).encargadoNombre());
    }

    @Test
    void getAllReports_shouldReturnEmptyList() {
        when(repository.findAllByOrderByFechaDesc(pageable)).thenReturn(Page.empty());

        List<ReportDto> result = reportService.getAllReports(pageable, admin).getContent();

        assertTrue(result.isEmpty());
    }

    @Test
    void getReportsForToday_shouldReturnTodayReports() {
        Report r1 = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);

        when(repository.findByFechaRange(any(Instant.class), any(Instant.class), any())).thenReturn(new PageImpl<>(List.of(r1)));

        List<ReportDto> result = reportService.getReportsForToday(pageable, admin).getContent();

        assertEquals(1, result.size());
        assertEquals("Daniel", result.get(0).encargadoNombre());
        verify(repository).findByFechaRange(any(Instant.class), any(Instant.class), any());
    }

    @Test
    void getReportsForToday_shouldReturnEmptyWhenNoReports() {
        when(repository.findByFechaRange(any(Instant.class), any(Instant.class), any())).thenReturn(Page.empty());

        List<ReportDto> result = reportService.getReportsForToday(pageable, admin).getContent();

        assertTrue(result.isEmpty());
    }

    @Test
    void createReports_shouldAllowMatchingOwner() {
        ReportDto dto = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L,
                7L, null, null, null, null, null, null);
        Report saved = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        when(repository.saveAll(anyList())).thenReturn(List.of(saved));

        List<ReportDto> result = reportService.createReports(List.of(dto), encargado("7"));

        assertEquals(1, result.size());
        verify(repository).saveAll(anyList());
    }

    @Test
    void createReports_shouldDefaultNullEncargadoIdToTokenSubjectForEncargado() {
        ReportDto dto = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L,
                null, null, null, null, null, null, null);
        Report saved = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        saved.setEncargadoId(7L);
        when(repository.saveAll(anyList())).thenReturn(List.of(saved));

        List<ReportDto> result = reportService.createReports(List.of(dto), encargado("7"));

        assertEquals(1, result.size());
        verify(repository).saveAll(anyList());
    }

    @Test
    void createReports_shouldRejectReportOwnedByAnotherEncargado() {
        ReportDto dto = new ReportDto(null, "1-A", Instant.now(), "Daniel", "Uribe", "morning", "completed", 1L,
                8L, null, null, null, null, null, null);

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.createReports(List.of(dto), encargado("7")));
        verify(repository, never()).saveAll(anyList());
    }

    @Test
    void getReportsByEncargado_shouldAllowMatchingOwner() {
        when(repository.findByEncargadoIdOrderByFechaDesc(7L, pageable)).thenReturn(Page.empty());

        assertTrue(reportService.getReportsByEncargado(7L, pageable, encargado("7")).getContent().isEmpty());
        verify(repository).findByEncargadoIdOrderByFechaDesc(7L, pageable);
    }

    @Test
    void getReportsByEncargado_shouldRejectAnotherOwner() {

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportsByEncargado(8L, pageable, encargado("7")));
        verify(repository, never()).findByEncargadoIdOrderByFechaDesc(8L, pageable);
    }

    @Test
    void getAllReports_shouldAllowAdminGlobalOperation() {
        SessionToken token = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
        when(repository.findAllByOrderByFechaDesc(pageable)).thenReturn(Page.empty());

        assertTrue(reportService.getAllReports(pageable, token).getContent().isEmpty());
    }

    @Test
    void getReportsForToday_shouldRejectOwnerAndAllowAdmin() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportsForToday(pageable, encargado("7")));

        when(repository.findByFechaRange(any(Instant.class), any(Instant.class), any())).thenReturn(Page.empty());
        assertTrue(reportService.getReportsForToday(pageable, admin).getContent().isEmpty());
    }

    @Test
    void getReportsByTerritorio_shouldAllowAnyAuthenticatedAndAdmin() {
        when(repository.findByTerritorioNumeroOrderByFechaDesc(12L, pageable)).thenReturn(Page.empty());
        assertTrue(reportService.getReportsByTerritorio(12L, pageable, encargado("7")).getContent().isEmpty());
        assertTrue(reportService.getReportsByTerritorio(12L, pageable, admin).getContent().isEmpty());

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportsByTerritorio(12L, pageable, null));
    }

    @Test
    void getReportsByMultipleTerritorios_shouldAllowAnyAuthenticatedAndAdmin() {
        when(repository.findLatestByTerritorioNumeroIn(List.of(12L)))
                .thenReturn(List.of());
        assertTrue(reportService.getReportsByMultipleTerritorios(List.of(12L), encargado("7")).isEmpty());
        assertTrue(reportService.getReportsByMultipleTerritorios(List.of(12L), admin).isEmpty());

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportsByMultipleTerritorios(List.of(12L), null));
    }

    @Test
    void getReportsByMultipleTerritorios_shouldGroupOneLatestReportPerTerritory() {
        Report old1 = createReport(1, "1-A", "Daniel", "Uribe", "05:00", "incomplete", 1L);
        old1.setFecha(Instant.parse("2026-08-01T10:00:00Z"));
        Report latest1 = createReport(2, "1-A", "Daniel", "Uribe", "06:00", "completed", 1L);
        latest1.setFecha(Instant.parse("2026-08-10T10:00:00Z"));
        Report latest2 = createReport(3, "2-B", "Maria", "Lopez", "07:00", "completed", 2L);
        latest2.setFecha(Instant.parse("2026-08-11T10:00:00Z"));

        when(repository.findLatestByTerritorioNumeroIn(List.of(1L, 2L)))
                .thenReturn(List.of(latest1, latest2));

        Map<Long, List<ReportDto>> result =
                reportService.getReportsByMultipleTerritorios(List.of(1L, 2L), admin);

        assertEquals(2, result.size());
        assertEquals(1, result.get(1L).size());
        assertEquals("completed", result.get(1L).get(0).estado());
        assertEquals(1, result.get(2L).size());
        assertEquals("completed", result.get(2L).get(0).estado());
        assertEquals(2L, result.get(2L).get(0).territorioNumero());
    }

    @Test
    void getReportVersions_requiresAuthenticatedUser() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportVersions(List.of(1L), null));
    }

    @Test
    void getReportVersions_rejectsBatchLargerThanMax() {
        assertThrows(IllegalArgumentException.class,
                () -> reportService.getReportVersions(
                        java.util.stream.LongStream.rangeClosed(1, 101).boxed().toList(), admin));
    }

    @Test
    void getReportVersions_groupsLastNonEmptyReportIdPerTerritory() {
        when(repository.findVersions(List.of(1L, 2L)))
                .thenReturn(List.of(new Object[]{1L, 101L}, new Object[]{2L, 103L}));

        Map<Long, Long> result = reportService.getReportVersions(List.of(1L, 2L), admin);

        assertEquals(2, result.size());
        assertEquals(Long.valueOf(101L), result.get(1L));
        assertEquals(Long.valueOf(103L), result.get(2L));
        verify(repository).findVersions(List.of(1L, 2L));
    }

    @Test
    void deleteReports_shouldDeleteOwnedReports() {
        Report owned = createReport(1, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        owned.setEncargadoId(7L);
        when(repository.findAllById(List.of(1))).thenReturn(List.of(owned));

        reportService.deleteReports(List.of(1), encargado("7"));

        verify(repository).deleteAll(List.of(owned));
    }

    @Test
    void deleteReports_shouldRejectReportOwnedByAnotherEncargado() {
        Report foreign = createReport(2, "1-A", "Daniel", "Uribe", "morning", "completed", 1L);
        foreign.setEncargadoId(8L);
        when(repository.findAllById(List.of(2))).thenReturn(List.of(foreign));

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.deleteReports(List.of(2), encargado("7")));
        verify(repository, never()).deleteAll(anyList());
    }

    @Test
    void deleteReports_shouldRejectEmptyIds() {
        assertThrows(IllegalArgumentException.class,
                () -> reportService.deleteReports(List.of(), admin));
        verify(repository, never()).findAllById(anyIterable());
    }

    private SessionToken encargado(String subject) {
        return new SessionToken(subject, SessionToken.ROLE_ENCARGADO, 1L, 2L);
    }
}
