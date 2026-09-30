package com.predicador.shared.util;

/**
 * Chilean phone number normalization utility.
 *
 * <p>Strips non-digit characters and prepends the country code {@code 56}
 * when the resulting number is a 9-digit mobile number starting with {@code 9}.</p>
 */
public final class PhoneUtil {

    private PhoneUtil() {}

    /**
     * Normalize a phone number to digits with Chilean country code.
     *
     * @param phone raw phone number (may contain spaces, dashes, parentheses, +)
     * @return normalized digits string, or {@code null} if input is {@code null}
     */
    public static String normalize(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 9 && digits.startsWith("9")) {
            return "56" + digits;
        }
        return digits;
    }

    /** Mensaje para un número que no es un celular chileno (lo ve el encargado). */
    public static final String MENSAJE_INVALIDO =
            "El número debe tener 9 dígitos y empezar con 9 (por ejemplo, 9 1234 5678).";

    /**
     * ¿Es un celular chileno? 9 dígitos que empiezan con 9, con o sin el
     * código de país (+56). Todos los números nuevos deben cumplirlo: con un
     * largo distinto la persona no puede entrar ni recibir el reporte.
     */
    public static boolean esCelularChileno(String phone) {
        String normalizado = normalize(phone);
        return normalizado != null && normalizado.matches("569\\d{8}");
    }
}
