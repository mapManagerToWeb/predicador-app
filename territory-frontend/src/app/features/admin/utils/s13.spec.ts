import { unzipSync, strFromU8 } from 'fflate';
import type { ReporteAdmin } from '../admin.models';
import { anioDeServicio, asignaciones, paginasS13, rangoAnioDeServicio, tiemposPorTerritorio } from './s13';
import { documentoS13 } from './s13-docx';

let id = 1;
function reporte(territorio: number, fecha: string, nombre: string, estado = 'incomplete', p: Partial<ReporteAdmin> = {}): ReporteAdmin {
  const [n, a] = nombre.split(' ');
  return {
    id: id++, fecha: `${fecha}T15:00:00`, inicioSesion: null, encargadoId: null, encargadoNombre: n, encargadoApellido: a ?? '',
    territorio, estado, tipoSesion: 'parcial', totalManzanas: 5, manzanasMarcadas: 1, manzanasIds: `${id}`, tieneParcial: false,
    origen: 'salida', ...p,
  };
}

/** Mismo patrón que un territorio real del S-13 de ejemplo (nombres inventados). */
const T64 = [
  reporte(64, '2025-09-10', 'Juan Pérez'),
  reporte(64, '2025-09-16', 'Pedro Rojas'),
  reporte(64, '2025-10-02', 'Pedro Rojas'),
  reporte(64, '2025-10-16', 'Pedro Rojas', 'completed'),
  reporte(64, '2025-11-07', 'Mario Vera'),
  reporte(64, '2025-11-12', 'Mario Vera', 'completed'),
  reporte(64, '2025-12-10', 'Juan Pérez'),
];

const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}` : null);

describe('S-13', () => {
  it('arma las asignaciones como en el papel: cambia de encargado sin completar, completa y vuelve a empezar', () => {
    const a = asignaciones(T64);
    expect(a.map(x => [x.encargado, dm(x.asignado), dm(x.completado)])).toEqual([
      ['Juan Pérez', '10-09', null],
      ['Pedro Rojas', '16-09', '16-10'],
      ['Mario Vera', '07-11', '12-11'],
      ['Juan Pérez', '10-12', null],
    ]);
  });

  it('usa el inicio de la salida como fecha de asignación y junta los dobles envíos', () => {
    const r = reporte(5, '2025-10-01', 'Ana Soto', 'incomplete', { inicioSesion: '2025-10-01T10:00:00', manzanasIds: 'a' });
    const doble = { ...r, id: 999, fecha: '2025-10-01T15:02:00' };
    const a = asignaciones([r, doble]);
    expect(a).toHaveLength(1);
    expect(a[0].asignado.getHours()).toBe(10);
  });

  it('un reinicio de ciclo cierra la asignación sin completarla; una corrección que completa, la completa', () => {
    const a = asignaciones([
      reporte(7, '2025-10-01', 'Ana Soto'),
      reporte(7, '2025-10-05', 'Administrador', 'completed', { origen: 'correccion' }),
      reporte(7, '2025-11-01', 'Luis Díaz'),
      reporte(7, '2025-11-02', 'Administrador', 'reiniciado', { origen: 'reinicio' }),
      reporte(7, '2025-11-03', 'Luis Díaz'),
    ]);
    expect(a.map(x => [x.encargado, dm(x.completado), !!x.trasReinicio])).toEqual([
      ['Ana Soto', '05-10', false],
      ['Luis Díaz', null, false],
      ['Luis Díaz', null, true],
    ]);
  });

  it('año de servicio: de septiembre a agosto', () => {
    expect(anioDeServicio(new Date(2025, 8, 1))).toBe(2026);
    expect(anioDeServicio(new Date(2026, 7, 31))).toBe(2026);
    const { desde, hasta } = rangoAnioDeServicio(2026);
    expect([desde.getFullYear(), desde.getMonth(), hasta.getFullYear(), hasta.getMonth()]).toEqual([2025, 8, 2026, 8]);
  });

  it('pagina de a 20 territorios y 4 asignaciones; la página siguiente trae la última fecha completada', () => {
    const extra = [...T64, reporte(64, '2026-01-05', 'Ana Soto', 'completed')];
    const territorios = Array.from({ length: 25 }, (_, i) => 50 + i);
    const { desde, hasta } = rangoAnioDeServicio(2026);
    const paginas = paginasS13(asignaciones(extra), territorios, desde, hasta);
    // 50-69 necesita 2 páginas (el 64 tiene 5 asignaciones); 70-74, una.
    expect(paginas).toHaveLength(3);
    expect(paginas[0].filas).toHaveLength(20);
    expect(paginas[2].filas.map(f => f.territorio)).toEqual([70, 71, 72, 73, 74]);
    const f64 = paginas[0].filas.find(f => f.territorio === 64)!;
    expect(f64.asignaciones.filter(Boolean)).toHaveLength(4);
    const f64b = paginas[1].filas.find(f => f.territorio === 64)!;
    expect(f64b.asignaciones[0]?.encargado).toBe('Ana Soto');
    expect(dm(f64b.ultimaCompletada)).toBe('12-11');
  });

  it('tiempo por territorio: días desde la primera asignación de la vuelta hasta completarla', () => {
    const { desde, hasta } = rangoAnioDeServicio(2026);
    const [t] = tiemposPorTerritorio(asignaciones(T64), desde, hasta);
    // Vuelta 1: 10-09 → 16-10 (36 días); vuelta 2: 07-11 → 12-11 (5 días).
    expect(t).toMatchObject({ territorio: 64, vueltas: 2, promedioDias: 21 });
  });

  it('genera un .docx válido con el formulario', () => {
    const { desde, hasta } = rangoAnioDeServicio(2026);
    const bytes = documentoS13(paginasS13(asignaciones(T64), [61, 62, 63, 64], desde, hasta), '2026');
    const archivos = unzipSync(bytes);
    expect(Object.keys(archivos)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']),
    );
    const xml = strFromU8(archivos['word/document.xml']);
    expect(xml).toContain('REGISTRO DE ASIGNACIÓN DE TERRITORIO');
    expect(xml).toContain('Pedro Rojas');
    expect(xml).toContain('16-10');
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });
});
