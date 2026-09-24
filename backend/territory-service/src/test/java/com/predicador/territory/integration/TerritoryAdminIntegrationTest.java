package com.predicador.territory.integration;

import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.territory.dto.ImportResultado;
import com.predicador.territory.dto.ManzanaAdminRequest;
import com.predicador.territory.dto.ManzanaAdminResponse;
import com.predicador.territory.service.ManzanaAdminService;
import com.predicador.territory.service.TerritoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Editor de manzanas contra PostGIS real (la validación y las transformaciones
 * de geometría viven en SQL, así que un mock no las prueba).
 *
 * <p>Corre con una base PostGIS de pruebas, de una de estas dos formas:</p>
 * <ul>
 *   <li>{@code -Ddocker.available=true}: levanta un contenedor con Testcontainers.</li>
 *   <li>{@code TERRITORY_IT_DB_URL} (+ {@code _USERNAME}/{@code _PASSWORD}): usa
 *       esa base, como el servicio PostGIS del CI. Tiene que llamarse
 *       {@code *_test}: el test borra todas las manzanas.</li>
 * </ul>
 */
@SpringBootTest
@EnabledIf("baseDisponible")
class TerritoryAdminIntegrationTest {

    private static final String URL_EXTERNA = System.getenv("TERRITORY_IT_DB_URL");

    static boolean baseDisponible() {
        return Boolean.getBoolean("docker.available") || URL_EXTERNA != null;
    }

    /** Cuadrado de ~100 m x 110 m en Lebu, con esquina inferior izquierda en (lon, lat). */
    private static String cuadrado(double lon, double lat) {
        double d = 0.001;
        return String.format(java.util.Locale.ROOT,
                "{\"type\":\"Polygon\",\"coordinates\":[[[%f,%f],[%f,%f],[%f,%f],[%f,%f],[%f,%f]]]}",
                lon, lat, lon + d, lat, lon + d, lat + d, lon, lat + d, lon, lat);
    }

    private static final String MOÑO = "{\"type\":\"Polygon\",\"coordinates\":[[[-73.60,-37.60],[-73.59,-37.59],"
            + "[-73.59,-37.60],[-73.60,-37.59],[-73.60,-37.60]]]}";

    static PostgreSQLContainer<?> postgis;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        String url;
        String usuario;
        String clave;
        if (URL_EXTERNA != null) {
            if (!URL_EXTERNA.matches("^jdbc:postgresql://[^/]+/\\w+_test(\\?.*)?$")) {
                throw new IllegalStateException(
                        "TERRITORY_IT_DB_URL debe apuntar a una base *_test: este test borra todas las manzanas");
            }
            url = URL_EXTERNA;
            usuario = System.getenv().getOrDefault("TERRITORY_IT_DB_USERNAME", "postgres");
            clave = System.getenv().getOrDefault("TERRITORY_IT_DB_PASSWORD", "");
        } else {
            postgis = new PostgreSQLContainer<>(
                    DockerImageName.parse("imresamu/postgis:18-3.6").asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("territory_test")
                    .withUsername("test")
                    .withPassword("test");
            postgis.start();
            url = postgis.getJdbcUrl();
            usuario = postgis.getUsername();
            clave = postgis.getPassword();
        }

        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> usuario);
        registry.add("spring.datasource.password", () -> clave);
        registry.add("spring.flyway.url", () -> url);
        registry.add("spring.flyway.user", () -> usuario);
        registry.add("spring.flyway.password", () -> clave);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("spring.cloud.config.enabled", () -> "false");
        registry.add("app.session.secret", () -> "integration-test-secret-0123456789abcdef");
    }

    @Autowired
    private ManzanaAdminService service;

    @Autowired
    private TerritoryService territoryService;

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void limpiar() {
        // Réplica mínima de las tablas derivadas del mapa MapLibre (territory V3).
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS territorio_disuelto (
                    territorio_padre BIGINT PRIMARY KEY,
                    geometry geometry(MultiPolygon, 4326) NOT NULL,
                    total_manzanas INTEGER NOT NULL)
                """).update();
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS manzana_s2_cover (
                    manzana_id BIGINT NOT NULL REFERENCES manzanas_territorio(id) ON DELETE CASCADE,
                    s2_cell_id BIGINT NOT NULL,
                    PRIMARY KEY (manzana_id, s2_cell_id))
                """).update();
        jdbc.sql("CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v BIGINT NOT NULL)").update();
        jdbc.sql("TRUNCATE manzana_s2_cover, territorio_disuelto, app_meta, territory_settings").update();
        jdbc.sql("DELETE FROM manzanas_territorio").update();
        jdbc.sql("INSERT INTO app_meta VALUES ('data_version', 1), ('s2_backfill_done', 1)").update();
    }

    @Test
    void crear_guardaGeometria3D_yRefrescaDerivados() {
        ManzanaAdminResponse creada = service.crear(new ManzanaAdminRequest(7L, " 7.a ", cuadrado(-73.65, -37.60)));

        assertThat(creada.id()).isEqualTo(1L);
        assertThat(creada.nombre()).isEqualTo("7.a");
        assertThat(creada.valida()).isTrue();
        assertThat(creada.areaM2()).isBetween(9_000.0, 11_000.0);
        assertThat(jdbc.sql("SELECT ST_NDims(geometry) FROM manzanas_territorio WHERE id = 1")
                .query(Integer.class).single()).isEqualTo(3);
        assertThat(jdbc.sql("SELECT total_manzanas FROM territorio_disuelto WHERE territorio_padre = 7")
                .query(Integer.class).single()).isEqualTo(1);
        assertThat(meta("data_version")).isEqualTo(2L);
        assertThat(meta("s2_backfill_done")).isZero();

        ManzanaAdminResponse segunda = service.crear(new ManzanaAdminRequest(7L, "7.b", cuadrado(-73.64, -37.60)));
        assertThat(segunda.id()).isEqualTo(2L);
        assertThat(jdbc.sql("SELECT total_manzanas FROM territorio_disuelto WHERE territorio_padre = 7")
                .query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void crear_noReutilizaIdsCitadosEnReportes() {
        boolean existia = Boolean.TRUE.equals(jdbc.sql("SELECT to_regclass('public.registro_predicacion') IS NOT NULL")
                .query(Boolean.class).single());
        if (!existia) {
            jdbc.sql("CREATE TABLE registro_predicacion (id SERIAL PRIMARY KEY, manzanas_ids TEXT)").update();
        }
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));
        jdbc.sql("INSERT INTO registro_predicacion (manzanas_ids) VALUES ('7-7.x,' || :id), ('12-12.a')")
                .param("id", a.id()).update();
        long citadoAntes = a.id();
        service.eliminar(a.id());

        ManzanaAdminResponse nueva = service.crear(new ManzanaAdminRequest(7L, "7.b", cuadrado(-73.64, -37.60)));

        assertThat(nueva.id()).isGreaterThan(citadoAntes);
        if (existia) {
            jdbc.sql("DELETE FROM registro_predicacion WHERE manzanas_ids IN ('7-7.x,' || :id, '12-12.a')")
                    .param("id", citadoAntes).update();
        } else {
            jdbc.sql("DROP TABLE registro_predicacion").update();
        }
    }

    @Test
    void crear_rechazaNombreRepetido_poligonoInvalido_yNoPoligonos() {
        service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));

        assertThatThrownBy(() -> service.crear(new ManzanaAdminRequest(7L, "7.A", cuadrado(-73.62, -37.60))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("ya tiene una manzana");
        assertThatThrownBy(() -> service.crear(new ManzanaAdminRequest(7L, "7.z", MOÑO)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("no es válido");
        assertThatThrownBy(() -> service.crear(new ManzanaAdminRequest(7L, "7.p",
                "{\"type\":\"Point\",\"coordinates\":[-73.6,-37.6]}")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("polígono");
        assertThatThrownBy(() -> service.crear(new ManzanaAdminRequest(7L, "7.q", "no es json")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("GeoJSON");
    }

    @Test
    void crear_avisaSuperposicion() {
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));
        ManzanaAdminResponse b = service.crear(new ManzanaAdminRequest(8L, "8.a", cuadrado(-73.6495, -37.60)));

        assertThat(b.solapaCon()).containsExactly(a.id());
        assertThat(service.calidad().get("solapes")).asList().hasSize(1);
    }

    @Test
    void actualizar_moverDeTerritorio_refrescaAmbosDisueltos() {
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));
        service.crear(new ManzanaAdminRequest(7L, "7.b", cuadrado(-73.64, -37.60)));

        ManzanaAdminResponse movida = service.actualizar(a.id(), new ManzanaAdminRequest(9L, "9.a", null));

        assertThat(movida.territorio()).isEqualTo(9L);
        assertThat(jdbc.sql("SELECT territorio_padre, total_manzanas FROM territorio_disuelto ORDER BY 1")
                .query((rs, n) -> rs.getLong(1) + ":" + rs.getInt(2)).list())
                .containsExactly("7:1", "9:1");
    }

    @Test
    void actualizar_geometriaEnElMismoTerritorio_guardaLaNuevaForma() {
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));
        jdbc.sql("INSERT INTO manzana_s2_cover VALUES (:id, 42)").param("id", a.id()).update();

        ManzanaAdminResponse editada = service.actualizar(a.id(),
                new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.60, -37.60)));

        assertThat(editada.territorio()).isEqualTo(7L);
        assertThat(editada.geometria()).contains("-73.6");
        assertThat(jdbc.sql("SELECT count(*) FROM manzana_s2_cover").query(Integer.class).single()).isZero();
        assertThat(meta("s2_backfill_done")).isZero();
    }

    @Test
    void cambios_noCambianColorDeOtrosTerritorios() {
        service.crear(new ManzanaAdminRequest(3L, "3.a", cuadrado(-73.65, -37.60)));
        service.crear(new ManzanaAdminRequest(5L, "5.a", cuadrado(-73.63, -37.60)));
        String colorDel5 = territoryService.getAllColors().get(5L);

        // Borrar el 3 corre al 5 a la primera posición de la paleta.
        service.eliminarTerritorio(3L);

        assertThat(territoryService.getAllColors().get(5L)).isEqualTo(colorDel5);
    }

    @Test
    void reasignar_detectaChoqueDeNombres() {
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "a", cuadrado(-73.65, -37.60)));
        service.crear(new ManzanaAdminRequest(8L, "a", cuadrado(-73.63, -37.60)));

        assertThatThrownBy(() -> service.reasignar(List.of(a.id()), 8L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("ya tiene manzanas con esos nombres");
        assertThat(service.reasignar(List.of(a.id()), 10L)).isEqualTo(1);
        assertThatThrownBy(() -> service.reasignar(List.of(999L), 10L))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void eliminar_borraCoberturaS2PorCascada() {
        ManzanaAdminResponse a = service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));
        jdbc.sql("INSERT INTO manzana_s2_cover VALUES (:id, 42)").param("id", a.id()).update();

        service.eliminar(a.id());

        assertThat(jdbc.sql("SELECT count(*) FROM manzana_s2_cover").query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM territorio_disuelto").query(Integer.class).single()).isZero();
        assertThatThrownBy(() -> service.obtener(a.id())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void reparar_corrigeAutoInterseccion() {
        jdbc.sql("""
                INSERT INTO manzanas_territorio (id, territorio_padre, nombre_bloque, geometry)
                VALUES (50, 7, 'moño', ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326)))
                """).param("gj", MOÑO).update();
        assertThat(service.calidad().get("invalidas")).asList().containsExactly(50L);

        ManzanaAdminResponse reparada = service.reparar(50L);

        assertThat(reparada.valida()).isTrue();
        assertThat(service.calidad().get("invalidas")).asList().isEmpty();
    }

    @Test
    void importar_esTodoONada() {
        String ok = "{\"type\":\"FeatureCollection\",\"features\":["
                + "{\"type\":\"Feature\",\"properties\":{\"territorio\":20,\"nombre\":\"20.a\"},\"geometry\":"
                + cuadrado(-73.65, -37.60) + "},"
                + "{\"type\":\"Feature\",\"properties\":{\"territorio_padre\":\"21\",\"nombre_bloque\":\"21.a\"},\"geometry\":"
                + cuadrado(-73.63, -37.60) + "}]}";
        ImportResultado resultado = service.importar(ok);
        assertThat(resultado.creadas()).isEqualTo(2);
        assertThat(resultado.territorios()).containsExactly(20L, 21L);

        String conError = "{\"type\":\"FeatureCollection\",\"features\":["
                + "{\"type\":\"Feature\",\"properties\":{\"territorio\":22,\"nombre\":\"22.a\"},\"geometry\":"
                + cuadrado(-73.61, -37.60) + "},"
                + "{\"type\":\"Feature\",\"properties\":{\"territorio\":20,\"nombre\":\"20.a\"},\"geometry\":"
                + cuadrado(-73.59, -37.60) + "}]}";
        assertThatThrownBy(() -> service.importar(conError))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("No se importó nada");
        assertThat(jdbc.sql("SELECT count(*) FROM manzanas_territorio").query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void listarGeoJson_exponeIdReal() {
        service.crear(new ManzanaAdminRequest(7L, "7.a", cuadrado(-73.65, -37.60)));

        String geojson = service.listarGeoJson();

        assertThat(geojson).contains("\"id\" : 1").contains("\"territorio\" : 7").contains("\"valida\" : true");
    }

    private long meta(String k) {
        return jdbc.sql("SELECT v FROM app_meta WHERE k = :k").param("k", k).query(Long.class).single();
    }
}
