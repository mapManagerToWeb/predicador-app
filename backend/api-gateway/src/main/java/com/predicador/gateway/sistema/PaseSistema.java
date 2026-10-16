package com.predicador.gateway.sistema;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.function.Supplier;

/**
 * Pase del módulo «Sistema»: además de la sesión de administrador, se vuelve a
 * pedir la contraseña y se entrega un pase que dura poco. Se vence a los
 * {@link #INACTIVIDAD} sin usarlo, y siempre a las {@link #MAXIMO}, aunque la
 * página quede abierta refrescándose.
 *
 * <p>Vive en memoria del gateway (una sola instancia): si se reinicia, hay que
 * volver a escribir la contraseña, que es lo esperable.</p>
 */
@Component
public class PaseSistema {

    static final Duration INACTIVIDAD = Duration.ofMinutes(15);
    static final Duration MAXIMO = Duration.ofHours(1);

    private final SecureRandom random = new SecureRandom();
    private final Supplier<Instant> reloj;
    private final Cache<String, Instant> pases;

    @Autowired
    public PaseSistema() {
        this(Instant::now, Ticker.systemTicker());
    }

    PaseSistema(Supplier<Instant> reloj, Ticker ticker) {
        this.reloj = reloj;
        this.pases = Caffeine.newBuilder()
                .expireAfterAccess(INACTIVIDAD)
                .maximumSize(20)
                .ticker(ticker)
                .build();
    }

    public String emitir() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String pase = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        pases.put(pase, reloj.get());
        return pase;
    }

    public boolean valido(String pase) {
        if (pase == null || pase.isBlank()) return false;
        Instant emitido = pases.getIfPresent(pase);
        if (emitido == null) return false;
        if (emitido.plus(MAXIMO).isBefore(reloj.get())) {
            pases.invalidate(pase);
            return false;
        }
        return true;
    }

    public void revocar(String pase) {
        if (pase != null) pases.invalidate(pase);
    }
}
