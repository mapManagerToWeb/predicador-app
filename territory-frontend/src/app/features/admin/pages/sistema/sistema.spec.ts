import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EstadoSistema } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { estadoContenedor, fmtBytes, fmtDuracion, resultadoRespaldo, separarContenedores, SistemaPage, tonoUso } from './sistema';

const estado: EstadoSistema = {
  hora: '2026-10-16T12:00:00Z',
  servidor: {
    memoriaTotal: 4 * 1024 ** 3,
    memoriaUsada: 3 * 1024 ** 3,
    discoTotal: 100 * 1024 ** 3,
    discoUsado: 90 * 1024 ** 3,
    cpu: 12.5,
    nucleos: 2,
    encendidoSegundos: 3 * 86400 + 4 * 3600,
  },
  contenedores: [
    { nombre: 'api-gateway', imagen: 'predicador-gateway', estado: 'running', detalle: 'Up 2 hours (healthy)', creado: '2026-10-16T10:00:00Z', memoriaUsada: 300 * 1024 ** 2, memoriaLimite: null, proyecto: 'predicador-app' },
    { nombre: 'reporting-service', imagen: 'predicador-reporting', estado: 'restarting', detalle: 'Restarting (1) 5 seconds ago', creado: null, memoriaUsada: null, memoriaLimite: null, proyecto: 'predicador-app' },
    { nombre: 'viejo-1', imagen: 'neo4j', estado: 'exited', detalle: 'Exited (137) 7 weeks ago', creado: null, memoriaUsada: null, memoriaLimite: null, proyecto: 'otro' },
  ],
  respaldos: [{ fecha: new Date().toISOString(), resultado: 'ok', tamano: 426699, url: 'https://github.com/x/runs/1' }],
  portainerUrl: 'https://portainer.test:9443',
};

describe('formato del módulo Sistema', () => {
  it('bytes y duraciones en palabras simples', () => {
    expect(fmtBytes(426699)).toBe('417 KB');
    expect(fmtBytes(1.5 * 1024 ** 3)).toBe('1,5 GB');
    expect(fmtBytes(null)).toBe('—');
    expect(fmtDuracion(3 * 86400 + 4 * 3600)).toBe('3 días y 4 horas');
    expect(fmtDuracion(86400)).toBe('1 día');
    expect(fmtDuracion(3600)).toBe('1 hora');
    expect(fmtDuracion(120)).toBe('2 minutos');
  });

  it('las barras avisan desde el 85 % y alarman desde el 95 %', () => {
    expect(tonoUso(50)).toBe('good');
    expect(tonoUso(85)).toBe('warning');
    expect(tonoUso(96)).toBe('critical');
    expect(tonoUso(null)).toBe('');
  });

  it('traduce el estado de Docker', () => {
    expect(estadoContenedor({ estado: 'running', detalle: 'Up 1 hour (healthy)' }).texto).toBe('Funcionando');
    expect(estadoContenedor({ estado: 'running', detalle: 'Up 1 hour (unhealthy)' }).tono).toBe('critical');
    expect(estadoContenedor({ estado: 'running', detalle: 'Up 5 seconds (health: starting)' }).texto).toBe('Arrancando');
    expect(estadoContenedor({ estado: 'exited', detalle: 'Exited (0) 2 days ago' }).texto).toBe('Terminó bien');
    expect(estadoContenedor({ estado: 'exited', detalle: 'Exited (137) 1 hour ago' }).tono).toBe('critical');
    expect(estadoContenedor({ estado: 'restarting', detalle: '' }).texto).toBe('Reiniciándose');
    expect(resultadoRespaldo({ resultado: 'fallo' }).texto).toBe('Falló');
    expect(estadoContenedor({ estado: 'created', detalle: 'Created' }).texto).toBe('Sin iniciar');
  });

  it('los contenedores de otros proyectos van aparte', () => {
    const { app, otros } = separarContenedores(estado.contenedores!);
    expect(app.map(c => c.nombre)).toEqual(['api-gateway', 'reporting-service']);
    expect(otros.map(c => c.nombre)).toEqual(['viejo-1']);
    expect(separarContenedores([{ ...estado.contenedores![1], proyecto: null }]).app).toHaveLength(1);
  });
});

describe('SistemaPage', () => {
  let fixture: ComponentFixture<SistemaPage>;
  let api: { estadoSistema: ReturnType<typeof vi.fn>; entrarSistema: ReturnType<typeof vi.fn>; salirSistema: ReturnType<typeof vi.fn> };
  const bloqueado = { status: 403, error: { code: 'sistema_bloqueado' } };

  beforeEach(async () => {
    api = { estadoSistema: vi.fn(), entrarSistema: vi.fn().mockResolvedValue(undefined), salirSistema: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [SistemaPage],
      providers: [{ provide: AdminApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(SistemaPage);
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('pide la contraseña y, al entrar, muestra servidor, servicios y respaldos', async () => {
    api.estadoSistema.mockRejectedValueOnce(bloqueado).mockResolvedValue(estado);
    await fixture.componentInstance.cargar();
    fixture.detectChanges();
    expect(el().querySelector('input[type=password]')).not.toBeNull();

    const input = el().querySelector('input[type=password]') as HTMLInputElement;
    input.value = 'clave';
    input.dispatchEvent(new Event('input'));
    await fixture.componentInstance.entrar();
    fixture.detectChanges();

    expect(api.entrarSistema).toHaveBeenCalledWith('clave');
    const texto = el().textContent ?? '';
    expect(texto).toContain('75%');
    expect(texto).toContain('queda poco espacio');
    expect(texto).toContain('api-gateway');
    expect(texto).toContain('Reiniciándose');
    expect(texto).toContain('un servicio con problemas: reporting-service');
    expect(texto).toContain('Otros contenedores del servidor');
    expect(texto).toContain('417 KB');
    expect(el().querySelector('a[href="https://portainer.test:9443"]')?.textContent).toContain('Abrir Portainer');
  });

  it('una contraseña mala se explica y no abre nada', async () => {
    api.estadoSistema.mockRejectedValue(bloqueado);
    api.entrarSistema.mockRejectedValue({ status: 403, error: { code: 'clave_incorrecta' } });
    await fixture.componentInstance.cargar();
    fixture.detectChanges();

    const input = el().querySelector('input[type=password]') as HTMLInputElement;
    input.value = 'mala';
    input.dispatchEvent(new Event('input'));
    await fixture.componentInstance.entrar();
    fixture.detectChanges();

    expect(el().textContent).toContain('La contraseña no es correcta');
    expect(el().textContent).not.toContain('Servicios');
  });

  it('si el pase vence mientras está abierta, vuelve a pedir la contraseña', async () => {
    api.estadoSistema.mockResolvedValueOnce(estado).mockRejectedValueOnce(bloqueado);
    await fixture.componentInstance.cargar();
    await fixture.componentInstance.cargar();
    fixture.detectChanges();

    expect(el().querySelector('input[type=password]')).not.toBeNull();
    expect(el().textContent).toContain('Se cerró por seguridad');
  });

  it('sin Docker o sin GitHub lo dice en vez de mostrar listas vacías', async () => {
    api.estadoSistema.mockResolvedValue({ ...estado, contenedores: null, respaldos: null, portainerUrl: null });
    await fixture.componentInstance.cargar();
    fixture.detectChanges();

    expect(el().textContent).toContain('No se pudo consultar Docker');
    expect(el().textContent).toContain('No se pudo consultar GitHub');
    expect(el().textContent).not.toContain('Abrir Portainer');
  });

  it('cerrar revoca el pase y vuelve a la contraseña', async () => {
    api.estadoSistema.mockResolvedValue(estado);
    await fixture.componentInstance.cargar();
    await fixture.componentInstance.salir();
    fixture.detectChanges();

    expect(api.salirSistema).toHaveBeenCalled();
    expect(el().querySelector('input[type=password]')).not.toBeNull();
  });
});
