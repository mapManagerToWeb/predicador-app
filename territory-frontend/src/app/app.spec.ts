import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { App } from './app';
import { Mantenimiento } from './core/services/mantenimiento';
import { ActualizacionApp } from './core/services/actualizacion';

@Component({ template: '' })
class Vacia {}

describe('App: la pantalla de mantenimiento', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '**', component: Vacia }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActualizacionApp, useValue: { hayVersionNueva: () => false, actualizar: vi.fn() } },
      ],
    });
  });

  it('se ve con su texto bíblico y «Intentar ahora» vuelve a probar; en el panel no aparece', async () => {
    const mantenimiento = TestBed.inject(Mantenimiento);
    const reintentar = vi.spyOn(mantenimiento, 'reintentar').mockResolvedValue();
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/map');
    mantenimiento.activo.set(true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mantenimiento h1')?.textContent).toContain('Estamos haciendo mejoras');
    expect(el.querySelector('figcaption')?.textContent).toBe(mantenimiento.texto().cita);
    (el.querySelector('.mantenimiento button') as HTMLButtonElement).click();
    expect(reintentar).toHaveBeenCalled();

    await TestBed.inject(Router).navigateByUrl('/admin/resumen');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(el.querySelector('.mantenimiento')).toBeNull();
  });
});
