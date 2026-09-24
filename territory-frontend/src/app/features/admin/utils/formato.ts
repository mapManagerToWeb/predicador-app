const LOCALE = 'es-CL';

const fechaCorta = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const fechaHora = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const diaMes = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const mesAnio = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' });
const numero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

type FechaEntrada = Date | string | null | undefined;

function aFecha(valor: FechaEntrada): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtFecha(valor: FechaEntrada, vacio = '—'): string {
  const d = aFecha(valor);
  return d ? fechaCorta.format(d) : vacio;
}

export function fmtFechaHora(valor: FechaEntrada, vacio = '—'): string {
  const d = aFecha(valor);
  return d ? fechaHora.format(d) : vacio;
}

export function fmtDiaMes(valor: FechaEntrada): string {
  const d = aFecha(valor);
  return d ? diaMes.format(d).replace('.', '') : '';
}

export function fmtMesAnio(valor: FechaEntrada): string {
  const d = aFecha(valor);
  return d ? mesAnio.format(d).replace('.', '') : '';
}

export function fmtNumero(valor: number | null | undefined, vacio = '—'): string {
  return valor === null || valor === undefined || Number.isNaN(valor) ? vacio : numero.format(valor);
}

/** "hoy", "ayer", "hace 5 días", "hace 3 meses"… */
export function fmtRelativo(valor: FechaEntrada, ahora = new Date(), vacio = 'nunca'): string {
  const d = aFecha(valor);
  if (!d) return vacio;
  const dias = Math.floor(
    (new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 45) return `hace ${dias} días`;
  if (dias < 548) return `hace ${Math.round(dias / 30.4)} meses`;
  return `hace ${fmtNumero(dias / 365.25)} años`;
}

/** Teléfono chileno legible: 56912345678 → +56 9 1234 5678. */
export function fmtTelefono(telefono: string | null | undefined): string {
  if (!telefono) return '—';
  const d = telefono.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('569')) return `+56 9 ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.length === 9 && d.startsWith('9')) return `9 ${d.slice(1, 5)} ${d.slice(5)}`;
  return telefono;
}
