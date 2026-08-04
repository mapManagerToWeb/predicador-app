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
}
