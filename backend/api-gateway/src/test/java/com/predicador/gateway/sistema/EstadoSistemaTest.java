package com.predicador.gateway.sistema;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class EstadoSistemaTest {

    @TempDir Path proc;

    private final List<String> pedidos = new ArrayList<>();
    private Function<ClientRequest, ClientResponse> respuestas;

    @BeforeEach
    void procFalso() throws IOException {
        Files.writeString(proc.resolve("meminfo"), """
                MemTotal:        4000000 kB
                MemFree:          500000 kB
                MemAvailable:    1000000 kB
                """);
        Files.writeString(proc.resolve("stat"), "cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 2 3 4\n");
        Files.writeString(proc.resolve("cpuinfo"), "processor\t: 0\nmodel\t: x\n\nprocessor\t: 1\n");
        Files.writeString(proc.resolve("uptime"), "3600.52 7000.10\n");
    }

    private static ClientResponse json(String cuerpo) {
        return ClientResponse.create(HttpStatus.OK)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(cuerpo)
                .build();
    }

    private EstadoSistema servicio(String dockerUrl, String portainer) {
        WebClient.Builder clientes = WebClient.builder().exchangeFunction(req -> {
            pedidos.add(req.url().toString());
            return Mono.just(respuestas.apply(req));
        });
        return new EstadoSistema(clientes, dockerUrl, "https://api.github.test", "org/repo", "respaldo.yml",
                portainer, proc.toString(), proc.toString());
    }

    @Test
    void leeMemoriaDiscoNucleosYEncendidoDelServidor() {
        respuestas = req -> json("{}");

        EstadoSistema.Servidor s = servicio("", null).servidor().block();

        assertThat(s.memoriaTotal()).isEqualTo(4_000_000L * 1024);
        assertThat(s.memoriaUsada()).isEqualTo(3_000_000L * 1024);
        assertThat(s.nucleos()).isEqualTo(2);
        assertThat(s.encendidoSegundos()).isEqualTo(3600);
        assertThat(s.discoTotal()).isPositive();
        assertThat(s.discoUsado()).isBetween(0L, s.discoTotal());
    }

    @Test
    void cpuSaleDeDosLecturasDeProcStat() throws IOException {
        EstadoSistema e = servicio("", null);
        long[] antes = e.leerCpu();
        Files.writeString(proc.resolve("stat"), "cpu  150 0 150 900 0 0 0 0 0 0\n");
        long[] despues = e.leerCpu();

        assertThat(antes).containsExactly(1000, 800);
        assertThat(despues).containsExactly(1200, 900);
        // 200 ticks en total, 100 libres: 50 % de uso.
    }

    @Test
    void contenedores_conMemoriaSinCache_yLosDetenidosSinConsumo() {
        respuestas = req -> {
            String url = req.url().toString();
            if (url.contains("/containers/json")) {
                return json("""
                        [{"Id":"a1","Names":["/reporting-service"],"Image":"predicador-reporting","State":"running",
                          "Status":"Up 3 hours (healthy)","Created":1760600000,"Labels":{"com.docker.compose.project":"predicador-app"}},
                         {"Id":"b2","Names":["/db-import"],"Image":"predicador-db-import","State":"exited",
                          "Status":"Exited (0) 2 days ago","Created":1760000000}]
                        """);
            }
            return json("""
                    {"memory_stats":{"usage":300000000,"limit":4000000000,"stats":{"inactive_file":100000000}}}
                    """);
        };

        EstadoSistema.Estado estado = servicio("http://docker-lectura:2375", "https://portainer.test")
                .consultar().block();

        assertThat(estado.portainerUrl()).isEqualTo("https://portainer.test");
        assertThat(estado.contenedores()).extracting(EstadoSistema.Contenedor::nombre)
                .containsExactly("db-import", "reporting-service");
        EstadoSistema.Contenedor reporting = estado.contenedores().get(1);
        assertThat(reporting.memoriaUsada()).isEqualTo(200_000_000L);
        assertThat(reporting.memoriaLimite()).isEqualTo(4_000_000_000L);
        assertThat(reporting.detalle()).contains("healthy");
        assertThat(reporting.creado()).isEqualTo(Instant.ofEpochSecond(1760600000));
        assertThat(reporting.proyecto()).isEqualTo("predicador-app");
        assertThat(estado.contenedores().get(0).memoriaUsada()).isNull();
        assertThat(estado.contenedores().get(0).proyecto()).isNull();
        // Solo se piden la lista y el consumo del que está funcionando: nunca «inspect».
        assertThat(pedidos).filteredOn(u -> u.contains("docker-lectura"))
                .allMatch(u -> u.contains("/containers/json") || u.contains("/containers/a1/stats"));
    }

    @Test
    void sinDockerConfiguradoNoSePideNada_yElPanelLoDice() {
        respuestas = req -> json("{\"workflow_runs\":[]}");

        EstadoSistema.Estado estado = servicio("", null).consultar().block();

        assertThat(estado.contenedores()).isNull();
        assertThat(estado.portainerUrl()).isNull();
        assertThat(pedidos).noneMatch(u -> u.contains("containers"));
    }

    @Test
    void siDockerNoRespondeLosContenedoresQuedanNulos() {
        respuestas = req -> req.url().toString().contains("containers")
                ? ClientResponse.create(HttpStatus.FORBIDDEN).build()
                : json("{\"workflow_runs\":[]}");

        assertThat(servicio("http://docker-lectura:2375", null).consultar().block().contenedores()).isNull();
    }

    @Test
    void respaldos_conResultadoYElTamanoDelUltimoBueno_yGuardadosDiezMinutos() {
        respuestas = req -> {
            String url = req.url().toString();
            if (url.contains("/artifacts")) {
                return json("{\"artifacts\":[{\"size_in_bytes\":426699,\"expired\":false}]}");
            }
            return json("""
                    {"workflow_runs":[
                      {"id":3,"status":"in_progress","conclusion":null,"created_at":"2026-10-16T12:37:50Z","html_url":"https://gh/3"},
                      {"id":2,"status":"completed","conclusion":"success","created_at":"2026-10-15T12:37:50Z","html_url":"https://gh/2"},
                      {"id":1,"status":"completed","conclusion":"failure","created_at":"2026-10-14T12:37:50Z","html_url":"https://gh/1"}]}
                    """);
        };
        EstadoSistema servicio = servicio("", null);

        List<EstadoSistema.Respaldo> respaldos = servicio.consultar().block().respaldos();

        assertThat(respaldos).extracting(EstadoSistema.Respaldo::resultado).containsExactly("en-curso", "ok", "fallo");
        assertThat(respaldos.get(1).tamano()).isEqualTo(426699L);
        assertThat(respaldos.get(0).tamano()).isNull();
        // El repositorio «dueño/nombre» va como dos partes de la ruta, sin %2F.
        assertThat(pedidos).anyMatch(u -> u.equals("https://api.github.test/repos/org/repo/actions/workflows/respaldo.yml/runs?per_page=7"));
        assertThat(pedidos).anyMatch(u -> u.equals("https://api.github.test/repos/org/repo/actions/runs/2/artifacts"));
        assertThat(pedidos).noneMatch(u -> u.contains("%2F"));

        int antes = pedidos.size();
        servicio.consultar().block();
        assertThat(pedidos).hasSize(antes);
    }

    @Test
    void siGitHubFallaLosRespaldosQuedanNulos() {
        respuestas = req -> ClientResponse.create(HttpStatus.SERVICE_UNAVAILABLE).build();

        assertThat(servicio("", null).consultar().block().respaldos()).isNull();
    }

    @Test
    void unArtefactoVencidoNoTieneTamano() {
        respuestas = req -> req.url().toString().contains("/artifacts")
                ? json("{\"artifacts\":[{\"size_in_bytes\":1,\"expired\":true}]}")
                : json("{\"workflow_runs\":[{\"id\":2,\"status\":\"completed\",\"conclusion\":\"success\","
                        + "\"created_at\":\"2026-10-15T12:37:50Z\",\"html_url\":\"https://gh/2\"}]}");

        assertThat(servicio("", null).consultar().block().respaldos()).singleElement()
                .satisfies(r -> assertThat(r.tamano()).isNull());
    }

    @Test
    void conProcIlegibleNoSeCae() throws IOException {
        Files.delete(proc.resolve("meminfo"));
        Files.delete(proc.resolve("stat"));
        Files.delete(proc.resolve("uptime"));
        respuestas = req -> json("{}");

        EstadoSistema.Servidor s = servicio("", null).servidor().block();

        assertThat(s.memoriaTotal()).isZero();
        assertThat(s.cpu()).isNull();
        assertThat(s.encendidoSegundos()).isNull();
    }
}
