package com.predicador.gateway.sistema;

import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SistemaControllerTest {

    private static final SessionToken ADMIN = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 4_000_000_000L);
    private static final SessionToken ENCARGADO = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 4_000_000_000L);

    private EstadoSistema estado;
    private PaseSistema pases;

    @BeforeEach
    void setUp() {
        estado = mock(EstadoSistema.class);
        pases = new PaseSistema();
        when(estado.consultar()).thenReturn(Mono.just(new EstadoSistema.Estado(Instant.now(),
                new EstadoSistema.Servidor(1, 1, 1, 1, 5.0, 2, 60L), List.of(), List.of(), null)));
    }

    private WebTestClient cliente(SessionToken sesion) {
        SistemaController controller = new SistemaController(new ClaveAdministrador("clave-local", "", false), pases, estado, true);
        return WebTestClient.bindToController(controller)
                .webFilter((exchange, chain) -> {
                    if (sesion != null) exchange.getAttributes().put(SecurityConstants.ATTR_TOKEN, sesion);
                    return chain.filter(exchange);
                })
                .build();
    }

    private String entrar(WebTestClient cliente) {
        ResponseCookie cookie = cliente.post().uri("/api/v1/sistema/entrar")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("clave", "clave-local"))
                .exchange()
                .expectStatus().isNoContent()
                .returnResult(Void.class)
                .getResponseCookies().getFirst(SistemaController.COOKIE);
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.isSecure()).isTrue();
        assertThat(cookie.getSameSite()).isEqualTo("Strict");
        assertThat(cookie.getPath()).isEqualTo("/api/v1/sistema");
        return cookie.getValue();
    }

    @Test
    void conLaContrasenaEntra_yConElPaseVeElEstado() {
        WebTestClient cliente = cliente(ADMIN);
        String pase = entrar(cliente);

        cliente.get().uri("/api/v1/sistema/estado").cookie(SistemaController.COOKIE, pase)
                .exchange()
                .expectStatus().isOk()
                .expectHeader().cacheControl(org.springframework.http.CacheControl.noStore())
                .expectBody().jsonPath("$.servidor.nucleos").isEqualTo(2);
    }

    @Test
    void sinPaseElEstadoEstaBloqueado_con403NoCon401() {
        cliente(ADMIN).get().uri("/api/v1/sistema/estado").cookie(SistemaController.COOKIE, "inventado")
                .exchange()
                .expectStatus().isForbidden()
                .expectBody().jsonPath("$.code").isEqualTo("sistema_bloqueado");
        verify(estado, never()).consultar();
    }

    @Test
    void conLaContrasenaMalaNoHayPase() {
        cliente(ADMIN).post().uri("/api/v1/sistema/entrar")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("clave", "otra"))
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist("Set-Cookie")
                .expectBody().jsonPath("$.code").isEqualTo("clave_incorrecta");
    }

    @Test
    void unEncargadoOSinSesionNoEntraNiConLaContrasena() {
        for (SessionToken sesion : new SessionToken[] {ENCARGADO, null}) {
            cliente(sesion).post().uri("/api/v1/sistema/entrar")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(Map.of("clave", "clave-local"))
                    .exchange()
                    .expectStatus().isForbidden()
                    .expectBody().jsonPath("$.code").isEqualTo("solo_administrador");
        }
        String pase = pases.emitir();
        cliente(ENCARGADO).get().uri("/api/v1/sistema/estado").cookie(SistemaController.COOKIE, pase)
                .exchange()
                .expectStatus().isForbidden();
        verify(estado, never()).consultar();
    }

    @Test
    void salirInvalidaElPase() {
        WebTestClient cliente = cliente(ADMIN);
        String pase = entrar(cliente);

        cliente.post().uri("/api/v1/sistema/salir").cookie(SistemaController.COOKIE, pase)
                .exchange()
                .expectStatus().isNoContent();

        assertThat(pases.valido(pase)).isFalse();
    }
}
