package com.predicador.gateway.sistema;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Lo que muestra el módulo «Sistema» del panel: el servidor (memoria, disco,
 * CPU), los contenedores y los respaldos. Todo es de solo lectura.
 *
 * <ul>
 *   <li><b>Servidor:</b> {@code /proc} y el disco vistos desde el contenedor
 *       del gateway, que son los del VPS (memoria, CPU y el disco donde Docker
 *       guarda todo, también la base de datos).</li>
 *   <li><b>Contenedores:</b> a través de {@code docker-lectura}, un HAProxy que
 *       solo deja pasar la lista y el consumo de memoria (ver
 *       {@code docker-lectura/haproxy.cfg}). El gateway nunca ve el socket de Docker.</li>
 *   <li><b>Respaldos:</b> las ejecuciones del workflow de respaldo en GitHub
 *       (API pública: el repositorio es público, no hace falta token).</li>
 * </ul>
 */
@Service
public class EstadoSistema {

    private static final Logger log = LoggerFactory.getLogger(EstadoSistema.class);
    private static final Duration ESPERA_DOCKER = Duration.ofSeconds(5);
    private static final Duration ESPERA_GITHUB = Duration.ofSeconds(8);
    /** GitHub permite 60 consultas por hora sin token: los respaldos se piden cada 10 minutos como mucho. */
    private static final Duration VIGENCIA_RESPALDOS = Duration.ofMinutes(10);
    private static final int RESPALDOS_A_MOSTRAR = 7;

    public record Servidor(long memoriaTotal, long memoriaUsada, long discoTotal, long discoUsado, Double cpu,
                           int nucleos, Long encendidoSegundos) {}

    /** {@code creado}: cuándo se creó el contenedor, o sea, la última vez que se desplegó ese servicio. */
    /**
     * {@code proyecto}: el proyecto de Docker Compose al que pertenece (la app
     * es uno; en el VPS puede haber otros, como Portainer).
     */
    public record Contenedor(String nombre, String imagen, String estado, String detalle, Instant creado,
                             Long memoriaUsada, Long memoriaLimite, String proyecto) {}

    /** {@code resultado}: {@code ok}, {@code fallo} o {@code en-curso}. */
    public record Respaldo(Instant fecha, String resultado, Long tamano, String url) {}

    /**
     * {@code contenedores} y {@code respaldos} son {@code null} cuando no se
     * pudieron consultar (el panel lo explica en vez de mostrar una lista vacía).
     */
    public record Estado(Instant hora, Servidor servidor, List<Contenedor> contenedores, List<Respaldo> respaldos,
                         String portainerUrl) {}

    private final WebClient docker;
    private final WebClient github;
    private final boolean conDocker;
    private final String dueno;
    private final String repositorio;
    private final String workflow;
    private final String portainerUrl;
    private final Path proc;
    private final File disco;
    private final Cache<String, List<Respaldo>> respaldos = Caffeine.newBuilder()
            .expireAfterWrite(VIGENCIA_RESPALDOS)
            .maximumSize(1)
            .build();

    /**
     * Spring Boot 4 trae la autoconfiguración de WebClient en un módulo aparte
     * que el gateway no usa: sin un {@code WebClient.Builder} propio, se crea uno.
     */
    @Autowired
    public EstadoSistema(ObjectProvider<WebClient.Builder> clientes,
                         @Value("${app.sistema.docker-url:}") String dockerUrl,
                         @Value("${app.sistema.github-api:https://api.github.com}") String githubApi,
                         @Value("${app.sistema.repositorio:mapManagerToWeb/predicador-app}") String repositorio,
                         @Value("${app.sistema.workflow-respaldo:respaldo-bdd.yml}") String workflow,
                         @Value("${app.sistema.portainer-url:}") String portainerUrl,
                         @Value("${app.sistema.proc:/proc}") String proc,
                         @Value("${app.sistema.disco:/}") String disco) {
        this(clientes.getIfAvailable(WebClient::builder), dockerUrl, githubApi, repositorio, workflow, portainerUrl,
                proc, disco);
    }

    EstadoSistema(WebClient.Builder clientes, String dockerUrl,
                  String githubApi, String repositorio, String workflow, String portainerUrl, String proc, String disco) {
        this.conDocker = dockerUrl != null && !dockerUrl.isBlank();
        this.docker = clientes.clone().baseUrl(conDocker ? dockerUrl : "http://localhost").build();
        this.github = clientes.clone()
                .baseUrl(githubApi)
                .defaultHeader("Accept", "application/vnd.github+json")
                .defaultHeader("User-Agent", "predicador-app-panel")
                .build();
        // «dueño/nombre»: van como dos partes de la ruta (una sola variable codificaría la barra como %2F).
        String[] partes = repositorio.split("/", 2);
        this.dueno = partes[0];
        this.repositorio = partes.length > 1 ? partes[1] : "";
        this.workflow = workflow;
        this.portainerUrl = portainerUrl == null || portainerUrl.isBlank() ? null : portainerUrl;
        this.proc = Path.of(proc);
        this.disco = new File(disco);
    }

    public Mono<Estado> consultar() {
        return Mono.zip(servidor(), contenedores(), respaldos())
                .map(t -> new Estado(Instant.now(), t.getT1(),
                        t.getT2().isEmpty() ? null : t.getT2().get(0),
                        t.getT3().isEmpty() ? null : t.getT3().get(0),
                        portainerUrl));
    }

    // ── Servidor ──

    Mono<Servidor> servidor() {
        // La CPU se mide entre dos lecturas de /proc/stat separadas medio segundo.
        return Mono.fromCallable(this::leerCpu)
                .subscribeOn(Schedulers.boundedElastic())
                .delayElement(Duration.ofMillis(500))
                .publishOn(Schedulers.boundedElastic())
                .map(antes -> {
                    long[] despues = leerCpu();
                    Double cpu = null;
                    if (antes.length == 2 && despues.length == 2 && despues[0] > antes[0]) {
                        double total = despues[0] - antes[0];
                        double libre = despues[1] - antes[1];
                        cpu = Math.round(1000 * (1 - libre / total)) / 10.0;
                    }
                    Map<String, Long> memoria = leerMemoria();
                    long total = memoria.getOrDefault("MemTotal", 0L);
                    long disponible = memoria.getOrDefault("MemAvailable", memoria.getOrDefault("MemFree", 0L));
                    long discoTotal = disco.getTotalSpace();
                    return new Servidor(total, Math.max(0, total - disponible), discoTotal,
                            Math.max(0, discoTotal - disco.getUsableSpace()), cpu, contarNucleos(), leerEncendido());
                });
    }

    /** {@code [total, libre]} de la primera línea de /proc/stat (en ticks), o vacío si no se pudo leer. */
    long[] leerCpu() {
        try {
            String[] partes = Files.readAllLines(proc.resolve("stat")).get(0).trim().split("\\s+");
            long total = 0;
            for (int i = 1; i < partes.length && i <= 8; i++) total += Long.parseLong(partes[i]);
            long libre = Long.parseLong(partes[4]) + (partes.length > 5 ? Long.parseLong(partes[5]) : 0);
            return new long[] {total, libre};
        } catch (IOException | RuntimeException e) {
            return new long[0];
        }
    }

    /** /proc/meminfo en bytes (MemTotal, MemAvailable…). */
    Map<String, Long> leerMemoria() {
        try {
            Map<String, Long> valores = new java.util.HashMap<>();
            for (String linea : Files.readAllLines(proc.resolve("meminfo"))) {
                String[] partes = linea.split(":\\s+");
                if (partes.length < 2) continue;
                String[] numero = partes[1].trim().split("\\s+");
                long kb = Long.parseLong(numero[0]);
                valores.put(partes[0], numero.length > 1 && "kB".equals(numero[1]) ? kb * 1024 : kb);
            }
            return valores;
        } catch (IOException | RuntimeException e) {
            return Map.of();
        }
    }

    private int contarNucleos() {
        try {
            int n = (int) Files.readAllLines(proc.resolve("cpuinfo")).stream().filter(l -> l.startsWith("processor")).count();
            return n > 0 ? n : Runtime.getRuntime().availableProcessors();
        } catch (IOException | RuntimeException e) {
            return Runtime.getRuntime().availableProcessors();
        }
    }

    private Long leerEncendido() {
        try {
            return (long) Double.parseDouble(Files.readString(proc.resolve("uptime")).trim().split("\\s+")[0]);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    // ── Contenedores ──

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ContenedorDocker(@JsonProperty("Id") String id, @JsonProperty("Names") List<String> nombres,
                            @JsonProperty("Image") String imagen, @JsonProperty("State") String estado,
                            @JsonProperty("Status") String detalle, @JsonProperty("Created") Long creado,
                            @JsonProperty("Labels") Map<String, String> etiquetas) {
        String proyecto() {
            return etiquetas == null ? null : etiquetas.get("com.docker.compose.project");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ConsumoDocker(@JsonProperty("memory_stats") Memoria memoria) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        record Memoria(Long usage, Long limit, Map<String, Long> stats) {}

        /** Memoria en uso sin la caché de archivos (lo mismo que muestra {@code docker stats}). */
        Long usada() {
            if (memoria == null || memoria.usage() == null) return null;
            Map<String, Long> s = memoria.stats() == null ? Map.of() : memoria.stats();
            long cache = s.getOrDefault("inactive_file", s.getOrDefault("total_inactive_file", 0L));
            return Math.max(0, memoria.usage() - cache);
        }
    }

    /** Lista de un elemento (los contenedores) o vacía si Docker no respondió. */
    Mono<List<List<Contenedor>>> contenedores() {
        if (!conDocker) return Mono.just(List.of());
        return docker.get().uri("/containers/json?all=true")
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<ContenedorDocker>>() {})
                .timeout(ESPERA_DOCKER)
                .flatMapMany(Flux::fromIterable)
                .flatMap(this::conConsumo, 4)
                .sort(Comparator.comparing(Contenedor::nombre))
                .collectList()
                .map(List::of)
                .onErrorResume(e -> {
                    log.warn("Panel Sistema: no se pudo consultar Docker ({})", e.toString());
                    return Mono.just(List.of());
                });
    }

    private Mono<Contenedor> conConsumo(ContenedorDocker c) {
        String nombre = c.nombres() == null || c.nombres().isEmpty() ? c.id() : c.nombres().get(0).replaceFirst("^/", "");
        Instant creado = c.creado() == null ? null : Instant.ofEpochSecond(c.creado());
        Contenedor sinConsumo = new Contenedor(nombre, c.imagen(), c.estado(), c.detalle(), creado, null, null,
                c.proyecto());
        if (!"running".equals(c.estado())) return Mono.just(sinConsumo);
        return docker.get().uri("/containers/{id}/stats?stream=false&one-shot=true", c.id())
                .retrieve()
                .bodyToMono(ConsumoDocker.class)
                .timeout(ESPERA_DOCKER)
                .map(s -> new Contenedor(nombre, c.imagen(), c.estado(), c.detalle(), creado, s.usada(),
                        s.memoria() == null ? null : s.memoria().limit(), c.proyecto()))
                .onErrorReturn(sinConsumo);
    }

    // ── Respaldos ──

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Ejecuciones(@JsonProperty("workflow_runs") List<Ejecucion> ejecuciones) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Ejecucion(long id, String status, String conclusion, @JsonProperty("created_at") Instant creada,
                     @JsonProperty("html_url") String url) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Artefactos(List<Artefacto> artifacts) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Artefacto(@JsonProperty("size_in_bytes") Long tamano, boolean expired) {}

    /** Lista de un elemento (los respaldos) o vacía si GitHub no respondió. */
    Mono<List<List<Respaldo>>> respaldos() {
        List<Respaldo> guardados = respaldos.getIfPresent("lista");
        if (guardados != null) return Mono.just(List.of(guardados));
        return github.get()
                .uri("/repos/{dueno}/{repo}/actions/workflows/{workflow}/runs?per_page={n}",
                        Map.of("dueno", dueno, "repo", repositorio, "workflow", workflow, "n", RESPALDOS_A_MOSTRAR))
                .retrieve()
                .bodyToMono(Ejecuciones.class)
                .timeout(ESPERA_GITHUB)
                .map(e -> e.ejecuciones() == null ? List.<Ejecucion>of() : e.ejecuciones())
                .flatMap(this::conTamanoDelUltimo)
                .doOnNext(lista -> respaldos.put("lista", lista))
                .map(List::of)
                .onErrorResume(e -> {
                    log.warn("Panel Sistema: no se pudo consultar los respaldos en GitHub ({})", e.toString());
                    return Mono.just(List.of());
                });
    }

    /** El tamaño se pide solo del último respaldo bueno: una consulta más, no una por respaldo. */
    private Mono<List<Respaldo>> conTamanoDelUltimo(List<Ejecucion> ejecuciones) {
        List<Respaldo> lista = ejecuciones.stream().map(EstadoSistema::comoRespaldo).toList();
        int ultimoBueno = -1;
        for (int i = 0; i < lista.size() && ultimoBueno < 0; i++) {
            if ("ok".equals(lista.get(i).resultado())) ultimoBueno = i;
        }
        if (ultimoBueno < 0) return Mono.just(lista);
        int indice = ultimoBueno;
        Respaldo r = lista.get(indice);
        return github.get()
                .uri("/repos/{dueno}/{repo}/actions/runs/{id}/artifacts",
                        Map.of("dueno", dueno, "repo", repositorio, "id", ejecuciones.get(indice).id()))
                .retrieve()
                .bodyToMono(Artefactos.class)
                .timeout(ESPERA_GITHUB)
                // Reactor no admite null: sin artefacto vigente queda vacío y se devuelve la lista sin tamaño.
                .flatMap(a -> Mono.justOrEmpty(a.artifacts() == null ? null : a.artifacts().stream()
                        .filter(x -> !x.expired() && x.tamano() != null)
                        .map(Artefacto::tamano)
                        .findFirst()
                        .orElse(null)))
                .map(tamano -> {
                    List<Respaldo> conTamano = new java.util.ArrayList<>(lista);
                    conTamano.set(indice, new Respaldo(r.fecha(), r.resultado(), tamano, r.url()));
                    return (List<Respaldo>) conTamano;
                })
                .onErrorReturn(lista)
                .defaultIfEmpty(lista);
    }

    static Respaldo comoRespaldo(Ejecucion e) {
        String resultado = !"completed".equals(e.status()) ? "en-curso"
                : "success".equals(e.conclusion()) ? "ok" : "fallo";
        return new Respaldo(e.creada(), resultado, null, e.url());
    }
}
