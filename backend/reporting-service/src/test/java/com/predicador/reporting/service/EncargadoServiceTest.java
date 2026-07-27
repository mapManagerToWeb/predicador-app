package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
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

    @InjectMocks
    private EncargadoService encargadoService;

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

        List<EncargadoDto> result = encargadoService.listarActivos();

        assertEquals(2, result.size());
        assertEquals("Daniel", result.get(0).nombre());
        assertEquals("56912345678", result.get(0).telefono());
        assertEquals("Maria", result.get(1).nombre());
        assertNull(result.get(1).telefono());
    }

    @Test
    void listarActivos_shouldReturnEmptyList() {
        when(repository.findByActivoTrueOrderByNombreAsc()).thenReturn(List.of());

        List<EncargadoDto> result = encargadoService.listarActivos();

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

        EncargadoDto result = encargadoService.actualizar(1L, dto);

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
                () -> encargadoService.actualizar(99L, dto));
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
        assertEquals("Daniel", result.get().nombre());
        assertEquals("56912345678", result.get().telefono());
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
        assertEquals("Daniel", result.get().nombre());
    }

    @Test
    void buscarPorNombre_shouldReturnMatchingEncargados() {
        Encargado e1 = createEncargado(1L, "Daniel", "Uribe", 1, null, true);

        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc("Daniel", "Daniel"))
                .thenReturn(List.of(e1));

        List<EncargadoDto> result = encargadoService.buscarPorNombre("Daniel");

        assertEquals(1, result.size());
        assertEquals("Daniel", result.get(0).nombre());
    }

    @Test
    void buscarPorNombre_shouldReturnEmptyWhenNoMatch() {
        when(repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc("XYZ", "XYZ"))
                .thenReturn(List.of());

        List<EncargadoDto> result = encargadoService.buscarPorNombre("XYZ");

        assertTrue(result.isEmpty());
    }
}
