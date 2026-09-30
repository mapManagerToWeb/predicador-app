export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 9 && digits.startsWith('9')) {
    return '+56' + digits;
  }
  return '+' + digits;
}

/** Lo que se muestra cuando el número no es un celular chileno. */
export const MENSAJE_TELEFONO_INVALIDO = 'El número debe tener 9 dígitos y empezar con 9 (por ejemplo, 9 1234 5678).';

/**
 * ¿Es un celular chileno? 9 dígitos que empiezan con 9, con o sin +56 (la
 * misma regla que el servidor, `PhoneUtil.esCelularChileno`). Con otro largo
 * la persona no podría entrar ni recibir su reporte por WhatsApp.
 */
export function esCelularChileno(phone: string | null | undefined): boolean {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  const local = digits.length === 11 && digits.startsWith('56') ? digits.slice(2) : digits;
  return /^9\d{8}$/.test(local);
}
