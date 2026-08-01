package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EncargadoServiceTest {

    @Mock
    private EncargadoRepository repository;

    private EncargadoService encargadoService;

    private final AuthorizationService authorization = new AuthorizationService();

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        encargadoService = new EncargadoService(repository, authorization);
    }

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    private Encargado createEncargado(Long id, String nombre, String apellido, Integer avatar, String telefono, Boolean activo) {
        Encargado encargado = new Encargado();
        encargado.setId(id);
        encargado.setNombre(nombre);
        encargado.setApellido(apellido);
        encargado.setAvatar(avatar);
        encargado.setTelefono(telefono);
        encargado.setActivo(activo);
        return encargado;
    }

    @Test
    void listarActivos_shouldReturnActiveEncargados() {
        Encargado e1 = createEncargado(1L, "Daniel", "Uribe", 1, "56912345678", true);
        Encargado e2 = createEncargado(2L, "Maria", "Lopez", 2, null, true);

        when(repository.findByActivoTrueOrderByNombreAsc()).thenReturn(List.of(e1, e2));

        List<EncargadoDto> result = encargadoService.listarActivos(admin);

        assertEquals(2, result.size());
        assertEquals("Daniel", result.get(0).nombre());
        assertEquals("56912345678", result.get(0).telefono());
        assertEquals("Maria", result.get(1).nombre());
        assertNull(result.get(1).telefono());
    }

    @Test
    void listarActivos_shouldReturnEmptyList() {
        when(repository.findByActivoTrueOrderByNombreAsc()).thenReturn(List.of());

        List<EncargadoDto> result = encargadoService.listarActivos(admin);

        assertTrue(result.isEmpty());
    }

    @Test
    void crear_shouldCreateAndReturnDto() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", 1, "56912345678", null);
        Encargado saved = createEncargado(1L, "Daniel", "Uribe", 1, "56912345678", true);

        when(repository.save(any(Encargado.class))).thenReturn(saved);

        EncargadoDto result = encargadoService.crear(dto);

        assertEquals("Daniel", result.nombre());
        assertEquals("Uribe", result.apellido());
        assertEquals(1, result.avatar());
        assertEquals("56912345678", result.telefono());
        assertTrue(result.activo());
        verify(repository, times(1)).save(any(Encargado.class));
    }

    @Test
    void crear_shouldDefaultAvatarToOne() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", null, null, null);
        Encargado saved = createEncargado(1L, "Daniel", "Uribe", 1, null, true);

        when(repository.save(any(Encargado.class))).thenReturn(saved);

        EncargadoDto result = encargadoService.crear(dto);

        assertEquals(1, result.avatar());
    }

    @Test
    void actualizar_shouldUpdateAndReturnDto() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", 2, "56999999999", false);
        Encargado existing = createEncargado(1L, "Daniel", "OldApellido", 1, "56911111111", true);
        Encargado updated = createEncargado(1L, "Daniel", "Uribe", 2, "56999999999", false);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(Encargado.class))).thenReturn(updated);

        EncargadoDto result = encargadoService.actualizar(1L, dto, admin);

        assertEquals("Uribe", result.apellido());
        assertEquals(2, result.avatar());
        assertEquals("56999999999", result.telefono());
        assertFalse(result.activo());
    }

    @Test
    void actualizar_shouldThrowWhenNotFound() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", 1, null, true);

        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(com.predicador.shared.exception.ResourceNotFoundException.class,
                () -> encargadoService.actualizar(99L, dto, admin));
    }

    @Test
    void actualizar_shouldAllowMatchingOwner() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", 1, null, true);
        Encargado existing = createEncargado(7L, "Daniel", "Old", 1, null, true);
        when(repository.findById(7L)).thenReturn(Optional.of(existing));
        when(repository.save(any(Encargado.class))).thenReturn(existing);

        assertEquals("Daniel", encargadoService.actualizar(7L, dto, encargado("7")).nombre());
        verify(repository).save(existing);
    }

    @Test
    void actualizar_shouldRejectAnotherOwnersRecord() {
        EncargadoDto dto = new EncargadoDto(null, "Daniel", "Uribe", 1, null, true);

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> encargadoService.actualizar(8L, dto, encargado("7")));
        verify(repository, never()).findById(8L);
    }

    @Test
    void buscarOCrear_shouldReturnExistingEncargado() {
        Encargado existing = createEncargado(1L, "Daniel", "Uribe", 1, null, true);
        Encargado saved = createEncargado(1L, "Daniel", "Uribe", 1, "56912345678", true);

        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
                anyString(), anyString()))
                .thenReturn(List.of(existing));
        when(repository.save(any(Encargado.class))).thenReturn(saved);

        Optional<EncargadoDto> result = encargadoService.buscarOCrear("Daniel", "Uribe", "56912345678");

        assertTrue(result.isPresent());
        EncargadoDto encargado = result.orElseThrow();
        assertEquals("Daniel", encargado.nombre());
        assertEquals("56912345678", encargado.telefono());
    }

    @Test
    void buscarOCrear_shouldCreateNewWhenNotFound() {
        Encargado saved = createEncargado(1L, "Daniel", "Uribe", 1, "56912345678", true);

        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
                anyString(), anyString()))
                .thenReturn(List.of());
        when(repository.save(any(Encargado.class))).thenReturn(saved);

        Optional<EncargadoDto> result = encargadoService.buscarOCrear("Daniel", "Uribe", "56912345678");

        assertTrue(result.isPresent());
        EncargadoDto encargado = result.orElseThrow();
        assertEquals("Daniel", encargado.nombre());
    }

    @Test
    void buscarPorNombre_shouldReturnMatchingEncargados() {
        Encargado e1 = createEncargado(1L, "Daniel", "Uribe", 1, null, true);

        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc("Daniel", "Daniel"))
                .thenReturn(List.of(e1));

        List<EncargadoDto> result = encargadoService.buscarPorNombre("Daniel", admin);

        assertEquals(1, result.size());
        assertEquals("Daniel", result.get(0).nombre());
    }

    @Test
    void buscarPorNombre_shouldReturnEmptyWhenNoMatch() {
        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc("XYZ", "XYZ"))
                .thenReturn(List.of());

        List<EncargadoDto> result = encargadoService.buscarPorNombre("XYZ", admin);

        assertTrue(result.isEmpty());
    }

    @Test
    void listarActivos_shouldRejectOwner() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> encargadoService.listarActivos(encargado("7")));
        verify(repository, never()).findByActivoTrueOrderByNombreAsc();
    }

    @Test
    void buscarPorNombre_shouldRejectOwner() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> encargadoService.buscarPorNombre("Daniel", encargado("7")));
        verify(repository, never())
                .findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc("Daniel", "Daniel");
    }

    private SessionToken encargado(String subject) {
        return new SessionToken(subject, SessionToken.ROLE_ENCARGADO, 1L, 2L);
    }
}
