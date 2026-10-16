package com.predicador.gateway.sistema;

import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * Módulo «Sistema» del panel (solo lectura): estado del VPS, contenedores y
 * respaldos. Exige sesión de administrador (por URL en {@code SecurityRules} y
 * de nuevo aquí, ADR 0016) y además un pase que se obtiene volviendo a
 * escribir la contraseña ({@link PaseSistema}).
 *
 * <p>Los rechazos del pase son 403 con {@code code}, no 401: un 401 haría que
 * la app cierre la sesión del panel entero.</p>
 */
@RestController
@RequestMapping("/api/v1/sistema")
public class SistemaController {

    static final String COOKIE = "predicador_sistema";
    private static final String RUTA_COOKIE = "/api/v1/sistema";

    private final ClaveAdministrador clave;
    private final PaseSistema pases;
    private final EstadoSistema estado;
    private final boolean cookieSegura;

    public SistemaController(ClaveAdministrador clave, PaseSistema pases, EstadoSistema estado,
                             @Value("${app.session.cookie-secure:false}") boolean cookieSegura) {
        this.clave = clave;
        this.pases = pases;
        this.estado = estado;
        this.cookieSegura = cookieSegura;
    }

    /** Vuelve a pedir la contraseña del administrador y entrega el pase (cookie HttpOnly). */
    @PostMapping("/entrar")
    public ResponseEntity<?> entrar(@RequestBody(required = false) Map<String, String> cuerpo, ServerWebExchange exchange) {
        if (!esAdmin(exchange)) return rechazo(HttpStatus.FORBIDDEN, "solo_administrador", "Solo para el administrador.");
        String intento = cuerpo == null ? null : cuerpo.get("clave");
        if (!clave.coincide(intento)) {
            return rechazo(HttpStatus.FORBIDDEN, "clave_incorrecta", "La contraseña no es correcta.");
        }
        exchange.getResponse().addCookie(cookie(pases.emitir(), PaseSistema.MAXIMO));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/estado")
    public Mono<ResponseEntity<?>> estado(ServerWebExchange exchange) {
        if (!esAdmin(exchange)) return Mono.just(rechazo(HttpStatus.FORBIDDEN, "solo_administrador", "Solo para el administrador."));
        if (!pases.valido(pase(exchange))) {
            return Mono.just(rechazo(HttpStatus.FORBIDDEN, "sistema_bloqueado", "Vuelve a escribir la contraseña."));
        }
        return estado.consultar()
                .map(e -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(e));
    }

    /** Cierra el módulo: el pase deja de servir aunque no haya vencido. */
    @PostMapping("/salir")
    public ResponseEntity<Void> salir(ServerWebExchange exchange) {
        pases.revocar(pase(exchange));
        exchange.getResponse().addCookie(cookie("", Duration.ZERO));
        return ResponseEntity.noContent().build();
    }

    private static boolean esAdmin(ServerWebExchange exchange) {
        return exchange.getAttribute(SecurityConstants.ATTR_TOKEN) instanceof SessionToken t
                && t.hasRole(SessionToken.ROLE_ADMIN);
    }

    private static String pase(ServerWebExchange exchange) {
        var c = exchange.getRequest().getCookies().getFirst(COOKIE);
        return c == null ? null : c.getValue();
    }

    private ResponseCookie cookie(String valor, Duration vida) {
        return ResponseCookie.from(COOKIE, valor)
                .httpOnly(true)
                .secure(cookieSegura)
                .sameSite("Strict")
                .path(RUTA_COOKIE)
                .maxAge(vida)
                .build();
    }

    private static ResponseEntity<ProblemDetail> rechazo(HttpStatus status, String code, String detalle) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detalle);
        p.setTitle("Sistema");
        p.setProperty("code", code);
        return ResponseEntity.status(status).body(p);
    }
}
