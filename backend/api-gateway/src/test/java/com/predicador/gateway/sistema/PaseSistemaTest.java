package com.predicador.gateway.sistema;

import com.github.benmanes.caffeine.cache.Ticker;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class PaseSistemaTest {

    private final AtomicLong nanos = new AtomicLong();
    private final AtomicReference<Instant> ahora = new AtomicReference<>(Instant.parse("2026-10-16T12:00:00Z"));
    private final PaseSistema pases = new PaseSistema(ahora::get, (Ticker) nanos::get);

    private void pasar(Duration d) {
        nanos.addAndGet(d.toNanos());
        ahora.updateAndGet(i -> i.plus(d));
    }

    @Test
    void unPaseRecienEmitidoSirve_yUnoInventadoNo() {
        String pase = pases.emitir();

        assertThat(pase).hasSizeGreaterThanOrEqualTo(40);
        assertThat(pases.valido(pase)).isTrue();
        assertThat(pases.valido("inventado")).isFalse();
        assertThat(pases.valido(null)).isFalse();
        assertThat(pases.valido("")).isFalse();
    }

    @Test
    void seVenceTrasQuinceMinutosSinUso() {
        String pase = pases.emitir();

        pasar(PaseSistema.INACTIVIDAD.plusSeconds(1));

        assertThat(pases.valido(pase)).isFalse();
    }

    @Test
    void usarloLoMantieneVivo_peroNuncaMasDeUnaHora() {
        String pase = pases.emitir();
        for (int i = 0; i < 5; i++) {
            pasar(Duration.ofMinutes(10));
            assertThat(pases.valido(pase)).as("minuto %d", (i + 1) * 10).isTrue();
        }

        pasar(Duration.ofMinutes(11));

        assertThat(pases.valido(pase)).isFalse();
    }

    @Test
    void salirLoRevoca() {
        String pase = pases.emitir();

        pases.revocar(pase);

        assertThat(pases.valido(pase)).isFalse();
    }
}
