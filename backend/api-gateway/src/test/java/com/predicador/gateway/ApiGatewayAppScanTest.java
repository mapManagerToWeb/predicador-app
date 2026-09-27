package com.predicador.gateway;

import com.predicador.shared.exception.GlobalExceptionHandler;
import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the gateway's component scan against silently re-absorbing the Spring MVC
 * exception advice.
 *
 * <p>Regression: {@code ApiGatewayApp} used {@code scanBasePackages = "com.predicador"}.
 * The {@code shared} POM marks {@code spring-boot-starter-web} as {@code <optional>} so
 * {@code spring-webmvc} is absent from this module — but a wide scan still discovered
 * {@link GlobalExceptionHandler} via ASM metadata (no class loading), registered the bean
 * definition, and then failed on instantiation: resolving the declared methods loaded
 * {@code NoResourceFoundException}, producing
 * {@code NoClassDefFoundError} → {@code IllegalStateException: Failed to introspect Class
 * [GlobalExceptionHandler]} → {@code BeanCreationException} → context refresh cancelled →
 * process exit 1. The gateway was then down, so every {@code /api/**} request from the dev
 * server failed with {@code ECONNREFUSED} and the map rendered no territories.</p>
 *
 * <p>This test fails fast and offline if anyone re-widens the scan (or reintroduces a
 * stereotype in the MVC-only {@code shared} exception package) — the failure mode is a
 * container that will not boot, which is only discovered at deploy time otherwise.</p>
 */
class ApiGatewayAppScanTest {

    /**
     * Enumerates the stereotype-annotated candidate components in the given packages, the
     * same way Spring's class-path scanning does: {@code include} filters, no class loading.
     */
    private static Set<String> scanCandidates(String... basePackages) {
        ClassPathScanningCandidateComponentProvider provider =
                new ClassPathScanningCandidateComponentProvider(false);
        provider.addIncludeFilter(new AnnotationTypeFilter(Component.class));
        Set<String> names = new TreeSet<>();
        for (String basePackage : basePackages) {
            for (BeanDefinition definition : provider.findCandidateComponents(basePackage)) {
                names.add(definition.getBeanClassName());
            }
        }
        return names;
    }

    private static String[] scanBasePackages() {
        SpringBootApplication annotation = ApiGatewayApp.class.getAnnotation(SpringBootApplication.class);
        assertThat(annotation)
                .as("@SpringBootApplication must be present on ApiGatewayApp")
                .isNotNull();
        return annotation.scanBasePackages();
    }

    @Test
    @DisplayName("gateway scan must not include the Spring MVC exception advice")
    void scan_excludesMvcExceptionAdvice() {
        Set<String> candidates = scanCandidates(scanBasePackages());

        assertThat(candidates)
                .as("GlobalExceptionHandler is Spring MVC (@RestControllerAdvice) and references "
                        + "NoResourceFoundException from spring-webmvc, which the WebFlux gateway "
                        + "deliberately keeps off its classpath. Registering it makes the context fail "
                        + "to refresh (Failed to introspect Class -> exit 1).")
                .doesNotContain(GlobalExceptionHandler.class.getName());
    }

    @Test
    @DisplayName("gateway scan must not cover the whole com.predicador tree")
    void scan_isNarrowedToWhatTheGatewayNeeds() {
        assertThat(scanBasePackages())
                .as("scanBasePackages must list packages explicitly. A bare \"com.predicador\" "
                        + "re-absorbs the MVC-only shared packages and breaks startup.")
                .isNotEqualTo(new String[] { "com.predicador" })
                .contains("com.predicador.gateway", "com.predicador.shared.security");
    }

    @Test
    @DisplayName("gateway scan still provides SessionTokenService from shared")
    void scan_includesSharedSessionTokenService() {
        // Guards against "fixing" the startup crash by over-narrowing the scan: AuthController
        // and ReactiveSessionAuthFilter both depend on this bean.
        Set<String> candidates = scanCandidates(scanBasePackages());

        assertThat(candidates).contains(SessionTokenService.class.getName());
    }

    @Test
    @DisplayName("no scanned candidate lives in the shared exception package")
    void scan_hasNoBeansInSharedExceptionPackage() {
        Set<String> offenders = scanCandidates(scanBasePackages()).stream()
                .filter(name -> name.startsWith("com.predicador.shared.exception."))
                .collect(Collectors.toSet());

        assertThat(offenders)
                .as("com.predicador.shared.exception is Spring-MVC-only. Any stereotype there is a "
                        + "latent gateway startup failure, not just a no-op.")
                .isEmpty();
    }

    @Test
    @DisplayName("shared stereotype packages are only the two with an explicit scan decision")
    void sharedStereotypePackagesAreOnlyTheKnownOnes() {
        // Guards the *whole* shared module, not just the exception package. Two
        // shared packages legitimately carry stereotypes today:
        //
        //   security  -> scanned (SessionTokenService @Service); pure domain, no MVC types
        //   exception -> deliberately NOT scanned (GlobalExceptionHandler @RestControllerAdvice,
        //                Spring MVC only; on this WebFlux classpath its mere registration
        //                fails the context refresh)
        //
        // A THIRD package gaining a stereotype means someone added a bean without deciding
        // whether the gateway gets it. Silently dropping it is a missing-bean bug; re-widening
        // the scan to pick it up is the startup crash this test exists to prevent. Either way
        // it must be a deliberate, reviewed decision, so fail here first.
        Set<String> sharedPackages = scanCandidates("com.predicador.shared")
                .stream()
                .map(ApiGatewayAppScanTest::packageOf)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(TreeSet::new));

        assertThat(sharedPackages)
                .as("A shared package outside {security, exception} gained a Spring stereotype. "
                        + "Decide explicitly whether the WebFlux gateway may scan it, then update "
                        + "ApiGatewayApp.scanBasePackages and this set together. Found: " + sharedPackages)
                .containsExactlyInAnyOrder("com.predicador.shared.security", "com.predicador.shared.exception");
    }

    /** Package name of a fully-qualified class name, or null if not class-shaped. */
    private static String packageOf(String className) {
        int lastDot = className.lastIndexOf('.');
        return lastDot < 0 ? null : className.substring(0, lastDot);
    }

    @Test
    @DisplayName("the gateway classpath has no spring-webmvc (invariant the shared POM documents)")
    void classpath_hasNoSpringWebMvc() {
        // The root cause only exists because of this asymmetry. The shared POM marks
        // spring-boot-starter-web <optional> for exactly this reason; if a future dependency
        // change makes it transitive again, the gateway would silently start with Tomcat and
        // break its WebFlux/Netty stack in far more confusing ways.
        assertThat(getClass().getClassLoader().getResource("org/springframework/web/servlet/resource/NoResourceFoundException.class"))
                .as("spring-webmvc leaked onto the gateway classpath. Gateway must stay WebFlux-only; "
                        + "check that no dependency pulls spring-boot-starter-web transitively.")
                .isNull();
    }
}
