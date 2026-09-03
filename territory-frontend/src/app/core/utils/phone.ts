export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 9 && digits.startsWith('9')) {
    return '+56' + digits;
  }
  return '+' + digits;
}
