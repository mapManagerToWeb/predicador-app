package com.predicador.shared.security;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Lleva la ruta de la petición a una forma canónica antes de compararla con las
 * reglas de {@link SecurityRules}.
 *
 * <p>El filtro y el enrutador de Spring no veían la misma cadena:
 * {@code HttpServletRequest#getRequestURI()} devuelve la ruta <em>tal cual
 * la escribió el cliente</em> (Tomcat no la decodifica), mientras que Spring
 * enruta sobre la ruta decodificada. Con {@code %61dmin} en lugar de
 * {@code admin}, {@code //} o {@code /./}, el filtro no encontraba la regla
 * de admin y dejaba pasar la petición que el enrutador sí llevaba al panel.</p>
 *
 * <p><strong>La forma canónica NO es la que calcula Spring</strong>, aunque se
 * le parezca. Medido contra spring-web 7.0.9: {@code RequestPath.parse} y
 * {@code PathPatternParser} decodifican los escapes percent POR SEGMENTO — vía
 * {@code PathContainer.PathSegment.valueToMatch()}, que es lo que compara el
 * enrutador —, pero NO eliminan los segmentos {@code .} (los preservan como
 * literales), NO colapsan {@code //} y NO resuelven {@code ..}. Este
 * canonicalizador, en cambio, SÍ resuelve {@code .}, {@code ..} y los
 * segmentos vacíos, y un escape mal formado se rechaza con 400. La divergencia
 * es deliberada y va en la dirección <em>fail-closed</em>: este canonicalizador
 * normaliza MÁS que el enrutador, y normalizar más significa que una petición
 * cae en MÁS reglas, es decir que se deniega más. Un canonicalizador que
 * coincidiera exactamente con Spring admitirá rutas que el enrutador acaba
 * servicing sin haber pasado por la regla. No "corrijamos" esta clase para
 * igualarla a Spring: eso reintroduce el bypass (ADR 0016).</p>
 *
 * <p>Un escape mal formado ({@code %zz}, {@code %A} sueltos) no se puede
 * canonicalizar: se lanza {@link IllegalArgumentException} para que el filtro
 * responda 400 en vez de comparar una ruta que nunca entendió.</p>
 */
public final class RequestPathCanonicalizer {

    private RequestPathCanonicalizer() {}

    /**
     * @param rawUri ruta tal como la entregó el contenedor, sin decodificar
     * @return la ruta decodificada y normalizada, siempre empezando por {@code /}
     * @throws IllegalArgumentException si hay un escape percent inválido
     */
    public static String canonicalize(String rawUri) {
        if (rawUri == null || rawUri.isEmpty()) {
            return "/";
        }
        return normalize(percentDecode(rawUri));
    }

    /**
     * Decodifica los escapes percent como UTF-8. A diferencia de
     * {@code URLDecoder}, un {@code +} es un {@code +}: en una ruta no es un
     * espacio.
     */
    private static String percentDecode(String uri) {
        int firstEscape = uri.indexOf('%');
        if (firstEscape < 0) {
            return uri;
        }
        StringBuilder decoded = new StringBuilder(uri.length());
        decoded.append(uri, 0, firstEscape);
        // Los escapes de un mismo carácter UTF-8 pueden venir en bytes sueltos
        // (%E2%82%AC), así que se acumulan y se decodifican juntos.
        ByteArrayOutputStream pendingBytes = new ByteArrayOutputStream(3);
        for (int i = firstEscape; i < uri.length(); i++) {
            char c = uri.charAt(i);
            if (c != '%') {
                flush(pendingBytes, decoded);
                decoded.append(c);
                continue;
            }
            if (i + 2 >= uri.length()) {
                throw new IllegalArgumentException("Escape percent incompleto en la ruta: " + uri);
            }
            int high = hexValue(uri.charAt(i + 1));
            int low = hexValue(uri.charAt(i + 2));
            if (high < 0 || low < 0) {
                throw new IllegalArgumentException("Escape percent inválido en la ruta: " + uri);
            }
            pendingBytes.write((high << 4) | low);
            i += 2;
        }
        flush(pendingBytes, decoded);
        return decoded.toString();
    }

    private static void flush(ByteArrayOutputStream pendingBytes, StringBuilder decoded) {
        if (pendingBytes.size() == 0) {
            return;
        }
        decoded.append(pendingBytes.toString(StandardCharsets.UTF_8));
        pendingBytes.reset();
    }

    /**
     * ASCII 0-9a-f exclusivamente. {@code Character.digit} también acepta
     * dígitos de otros alfabetos (ancho completo, devanagari…), así que una
     * ruta con esos caracteres se decodificaría en vez de rechazarse. Tomcat
     * no deja pasar esos bytes en el request line, pero el canonicalizador es
     * un límite de seguridad y no debe depender de lo que acepte el contenedor.
     */
    private static int hexValue(char c) {
        if (c >= '0' && c <= '9') {
            return c - '0';
        }
        if (c >= 'a' && c <= 'f') {
            return c - 'a' + 10;
        }
        if (c >= 'A' && c <= 'F') {
            return c - 'A' + 10;
        }
        return -1;
    }

    /**
     * Resuelve {@code .}, {@code ..} y los segmentos vacíos ({@code //}). Un
     * {@code ..} que sube por encima de la raíz se descarta en vez de atacar
     * hacia atrás: Tomcat rechaza esa ruta antes de llegar aquí, y dejarla
     * corta nunca relaja una regla.
     */
    private static String normalize(String path) {
        StringBuilder canonical = new StringBuilder(path.length());
        for (String segment : path.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                int lastSlash = canonical.lastIndexOf("/");
                // `canonical` se construye anteponiendo '/' a cada segmento, así
                // que tras un único segmento vale "/api" y lastIndexOf("/") == 0.
                // La condición es `>= 0`: con `> 0` ese primer segmento no se
                // popping, y "/api/../api/v1/x" salía "/api/api/v1/x".
                if (lastSlash >= 0) {
                    canonical.setLength(lastSlash);
                }
                continue;
            }
            canonical.append('/').append(segment);
        }
        return canonical.isEmpty() ? "/" : canonical.toString();
    }
}
