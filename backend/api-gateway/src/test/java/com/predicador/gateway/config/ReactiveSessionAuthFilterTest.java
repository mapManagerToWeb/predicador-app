package com.predicador.gateway.config;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SecurityRule;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.TokenValidator;
import com.predicador.shared.security.SecurityRules;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

class ReactiveSessionAuthFilterTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private ReactiveSessionAuthFilter filter;
    /** Filtro con las reglas REALES del gateway, para las pruebas de H4. */
    private ReactiveSessionAuthFilter filterWithGatewayRules;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        filter = new ReactiveSessionAuthFilter(new TokenValidator(tokens, List.of(
                SecurityRule.of("POST", "^/api/v1/reports$", null),
                SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        )));
        filterWithGatewayRules = new ReactiveSessionAuthFilter(
                new TokenValidator(tokens, SecurityRules.GATEWAY));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_setsAttributesAndContinues() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filter.filter(exchange, ex -> {
            assertEquals("42", ex.getAttribute("predicador.session.subject"));
            assertNotNull(ex.getAttribute("predicador.session.token"));
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0]);
    }

    @Test
    void missingToken_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ex -> Mono.empty()).block();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }

    @Test
    void nonMatchingRoute_passesThrough() {
        MockServerHttpRequest request = MockServerHttpRequest
                .get("/api/v1/territories")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filter.filter(exchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0]);
    }

    @Test
    void roleMismatch_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .put("/api/v1/territories/5/color")
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ex -> Mono.empty()).block();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }

    // -- mitad del gateway de H4 --------------------------------------------
    //
    // El filtro reactivo tiene que aplicar el MISMO canonicalizador que el de
    // servlet, porque comparte las reglas con el (TokenValidator). Estas
    // pruebas escriben la MISMA ruta de varias formas y comprueban que el
    // filtro las agrupa bajo la MISMA regla. Se instalan las reglas REALES de
    // SecurityRules.GATEWAY, no un juego reducido: si una forma se colara como
    // publica, el filtro la dejaria pasar y estas pruebas lo detectarian.
    //
    // No se puede construir una peticion con "//" INICIAL a traves de
    // MockServerHttpRequest: java.net.URI interpreta "//api" como AUTHORITY
    // ("//api//v1/x" -> rawPath "/v1//x"), de modo que el prefijo "/api" se
    // pierde antes de llegar al filtro. Es una limitacion del mock, no del
    // gateway en produccion, donde Reactor Netty arma la URI desde la
    // request-line cruda. Por eso los casos con barras duplicadas empiezan por
    // "/api//" y no por "//api//". El caso de barra inicial ya lo cubre
    // RequestPathCanonicalizerTest, que no pasa por una URI.

    private static final List<String> WRITINGS_OF_THE_ADMIN_RULE = List.of(
            "/api/v1/territories/admin/manzanas",
            "/api/v1/territories/%61dmin/manzanas",
            "/api//v1//territories//admin//manzanas",
            "/api/v1/territories/./admin/./manzanas",
            "/api/../api/v1/territories/admin/manzana",
            "/a/b/../../../api/v1/territories/admin/manzana",
            "/api/v1/territories/admin/../admin/manzanas");

    @ParameterizedTest(name = "sin token de admin, la escritura {0} se rechaza")
    @MethodSource("obfuscatedAdminPaths")
    void obfuscatedAdminPathWithoutAdminToken_isRejected(String rawPath) {
        MockServerHttpRequest request = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create(rawPath))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filterWithGatewayRules.filter(exchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertEquals(401, exchange.getResponse().getStatusCode().value(),
                "la escritura " + rawPath + " no debe pasar sin token de admin");
        assertFalse(chainCalled[0], "la escritura " + rawPath + " llego al enrutador sin autenticar");
    }

    @ParameterizedTest(name = "con token de admin, la escritura {0} pasa")
    @MethodSource("obfuscatedAdminPaths")
    void obfuscatedAdminPathWithAdminToken_passes(String rawPath) {
        MockServerHttpRequest request = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create(rawPath))
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, adminToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filterWithGatewayRules.filter(exchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0], "la escritura " + rawPath + " debe pasar con token de admin");
    }

    /**
     * Una sola decodificacion. "%2561dmin" decodifica UNA vez a "%61dmin", que
     * NO es "admin": es un segmento literal llamado "%61dmin" que no casa con
     * la regla de admin. Si el filtro decodificase dos veces ("%25" -> "%",
     * "61" -> "a") llegaria a "admin" y trataria la peticion como si fuera la
     * ruta legitima de administracion.
     *
     * <p>Medido contra spring-web 7.0.9, {@code RequestPath.value()} devuelve
     * la ruta CRUDA: la decodificacion por segmento ocurre en
     * {@code valueToMatch()}, que es lo que usa PathPattern, mientras
     * {@code value()} devuelve el original sin decodificar. Hoy, por tanto,
     * {@code getPath().value()} y {@code getURI().getRawPath()} coinciden y
     * esta prueba pasaria con cualquiera de los dos. Se conserva como
     * REGRESION documentada: fija que hay que decodificar exactamente una vez,
     * y falla si alguien deja que la capa de Spring lo haga (o lo deshaga) por su
     * cuenta.</p>
     *
     * <p>Ojo con lo que NO afirma esta prueba: que la peticion pase no significa
     * que sirva algo. "/api/v1/territories/%61dmin/manzanas" no casa con ningun
     * handler, asi que el enrutador la devuelve 404. Aqui no hay una sesion de
     * administracion expuesta; lo que se fija es que el filtro y el enrutador
     * coinciden en decidir que esta ruta no es la de admin.</p>
     */
    @Test
    void doubleEncodedAdmin_isDecodedExactlyOnce_soItIsNotAdmin() {
        // SIN token: si se decodificara dos veces, "%2561dmin" -> "%61dmin" ->
        // "admin", la regla de admin casaria y la peticion se rechazaria con 401.
        // Decodificando una sola vez el segmento es "%61dmin" a secas, que no
        // casa con NINGUNA regla: el filtro lo deja pasar como ruta no
        // gobernada, igual que haria con cualquier ruta desconocida. Spring
        // tampoco la enruta a admin, asi que no queda ningun hueco entre lo que
        // el filtro cree y lo que el enrutador sirve.
        MockServerHttpRequest denied = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create("/api/v1/territories/%2561dmin/manzanas"))
                .build();
        MockServerWebExchange deniedExchange = MockServerWebExchange.from(denied);
        final boolean[] reachedChain = {false};
        filterWithGatewayRules.filter(deniedExchange, ex -> {
            reachedChain[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(reachedChain[0],
                "%2561dmin no debe convertirse en admin: eso seria una doble decodificacion");
        assertNull(deniedExchange.getResponse().getStatusCode(),
                "no se escribio ninguna respuesta: la ruta no casa con ninguna regla");
    }

    /**
     * El caso anterior pasaria igual con un filtro que no hiciera nada, asi que
     * se prueba el otro eje del mismo par: la MISMA ruta se rechaza sin token y
     * se acepta con token de admin. Asi "pasa" y "se rechaza" no pueden
     * confundirse con "el filtro no llego a ejecutarse".
     */
    @Test
    void sameRule_deniesWithoutTokenAndAllowsWithIt() {
        MockServerHttpRequest denied = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create("/api/v1/territories/%61dmin/manzanas"))
                .build();
        MockServerWebExchange deniedExchange = MockServerWebExchange.from(denied);
        filterWithGatewayRules.filter(deniedExchange, ex -> Mono.empty()).block();
        assertEquals(401, deniedExchange.getResponse().getStatusCode().value());

        MockServerHttpRequest allowed = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create("/api/v1/territories/%61dmin/manzanas"))
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, adminToken))
                .build();
        MockServerWebExchange allowedExchange = MockServerWebExchange.from(allowed);
        final boolean[] chainCalled = {false};
        filterWithGatewayRules.filter(allowedExchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();
        assertTrue(chainCalled[0], "con token de admin esta escritura debe pasar: el filtro si corrio");
    }

    /**
     * Un escape mal formado no se canonicaliza y el filtro lo rechaza, pero no
     * se puede ejercitar a traves de un request de prueba: {@code URI.create}
     * lanza antes de armar la peticion. Se documenta la limitacion en vez de
     * fingir cobertura; la cobertura real de este caso vive en
     * {@code RequestPathCanonicalizerTest} y {@code SessionAuthFilterTest},
     * que es donde ocurre la canonicalizacion.
     */
    @Test
    void malformedEscapeCannotReachTheFilterThroughAMockRequest() {
        assertThrows(IllegalArgumentException.class,
                () -> URI.create("/api/v1/territories/%zzadmin/manzanas"),
                "java.net.URI ya rechaza el escape mal formado: por eso esta ruta "
                        + "no se puede probar a traves de un request de prueba");
    }

    /** Una ruta genuinamente publica sigue pasando sin token. */
    @Test
    void genuinelyPublicPath_stillPassesWithoutToken() {
        MockServerHttpRequest request = MockServerHttpRequest
                .method(HttpMethod.GET, URI.create("/api/v1/reports/public/territorios"))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filterWithGatewayRules.filter(exchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0], "/reports/public/** es la unica ruta de reports sin sesion");
    }

    static Stream<String> obfuscatedAdminPaths() {
        return WRITINGS_OF_THE_ADMIN_RULE.stream();
    }
}
