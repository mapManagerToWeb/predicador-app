package com.predicador.territory.tile;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * Versión de datos leída de {@code app_meta.data_version} con caché
 * Caffeine de 1 s.
 *
 * <p>Los mutadores (F2) bumpan la versión dentro de la misma transacción;
 * una lectura con hasta 1 s de retraso es aceptable porque las claves de
 * caché y los ETags de los tiles incorporan la versión: un tile servido
 * con la versión anterior lleva su propio ETag, nunca uno nuevo con dato
 * viejo.</p>
 */
@Service
public class DataVersionService {

    private static final String CACHE_KEY = "data_version";
    private static final long DEFAULT_VERSION = 1L;

    private final TerritoryTileRepository repo;
    private final Cache<String, Long> cache;

    public DataVersionService(TerritoryTileRepository repo) {
        this.repo = repo;
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(1))
                .maximumSize(1)
                .build();
    }

    /**
     * Versión de datos vigente. Si {@code app_meta} no tiene la fila
     * (datos no migrados ever), cae a {@link #DEFAULT_VERSION}.
     */
    public long current() {
        Long version = cache.get(CACHE_KEY, key -> load());
        return version == null ? DEFAULT_VERSION : version;
    }

    private Long load() {
        Optional<Long> stored = repo.findDataVersion();
        if (stored.isEmpty()) {
            return DEFAULT_VERSION;
        }
        return stored.get();
    }
}