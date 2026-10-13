package com.predicador.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Tripwire: booting the gateway context must not explode while Spring builds
 * its {@code @ControllerAdvice} caches.
 *
 * <p>Spring Cloud Gateway is a WebFlux (reactive) application, but
 * {@link ApiGatewayApp} scans {@code com.predicador}, deliberately pulling
 * {@code shared}'s {@code @RestControllerAdvice} into the reactive context.
 * That context has NO spring-webmvc / servlet classes on its classpath. If any
 * scanned advice declares a method whose signature references an
 * {@code org.springframework.web.servlet.*} type, Spring throws while
 * introspecting the class:</p>
 *
 * <pre>
 * AutowiredAnnotationBeanPostProcessor.checkLookupMethods
 *   -&gt; ReflectionUtils.getDeclaredMethods
 *   -&gt; NoClassDefFoundError
 *      (org/springframework/web/servlet/resource/NoResourceFoundException)
 * </pre>
 *
 * <p>That failure aborts context refresh and the gateway never starts: a total
 * API outage. This test asserts the context refreshes with no exception, so any
 * future servlet/MVC leak into a gateway-visible bean fails {@code mvn verify}.</p>
 *
 * <p>{@code WebEnvironment.MOCK} is intentional: it still builds a reactive
 * {@code ApplicationContext} (and therefore still runs WebFlux auto-configuration
 * and advice introspection) without binding a real Netty port. External infra is
 * disabled so the test is hermetic.</p>
 */
@SpringBootTest(
        classes = ApiGatewayApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                // No registry lookup at context load; lb:// resolves at request time.
                "eureka.client.enabled=false",
                // SessionTokenService refuses an empty secret in strict mode (shared/security).
                "app.session.secret=test-secret-for-context-load-0123456789abcdef",
                // Non-secret admin defaults so AuthController can be constructed.
                // Strict-mode AuthController requires a non-blank bcrypt hash;
                // the value is never matched in this context-load test.
                "app.admin.username=admin",
                "app.admin.password=password",
                "app.admin.password-bcrypt=$2a$10$C6UzMDM.H6dfI/f/IKcEeO6dQhGqE1cT0n4mB2oQ0YQ0Xw3m9eK2a",
                "app.session.strict=true",
                // Config client is not on the gateway classpath, but disable explicitly.
                "spring.cloud.config.enabled=false",
                "spring.cloud.config.import-check.enabled=false",
                // Keep OTel exporters inert.
                "otel.traces.exporter=none",
                "otel.metrics.exporter=none",
                "otel.logs.exporter=none"
        })
class ApiGatewayApplicationContextTest {

    @Test
    void contextLoads() {
        // Intentionally empty: the assertion is that the context refreshes at all.
        // A servlet-typed @ExceptionHandler in a gateway-scanned advice makes this
        // fail during refresh (Failed to introspect Class ... NoClassDefFoundError).
    }
}
