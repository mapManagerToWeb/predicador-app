package com.predicador.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Gateway entry point (WebFlux/Netty).
 *
 * <p>The component scan is deliberately <em>narrowed</em> instead of covering all of
 * {@code com.predicador}. The gateway must never pick up
 * {@code com.predicador.shared.exception.GlobalExceptionHandler}: it is a Spring MVC
 * {@code @RestControllerAdvice} whose method signatures reference
 * {@code org.springframework.web.servlet.resource.NoResourceFoundException} and
 * {@code MethodArgumentNotValidException}, both from {@code spring-webmvc}. The
 * {@code shared} POM marks {@code spring-boot-starter-web} as {@code <optional>} precisely so
 * {@code spring-webmvc} stays off this module's classpath.</p>
 *
 * <p>Scanning {@code com.predicador} wholesale still broke startup: component scanning reads
 * stereotype metadata via ASM (no class loading), so the bean <em>definition</em> was
 * registered; instantiating it then triggered
 * {@code Class.getDeclaredMethods0()} to resolve the parameter type, which raised
 * {@code NoClassDefFoundError: .../NoResourceFoundException} →
 * {@code IllegalStateException: Failed to introspect Class [GlobalExceptionHandler]} →
 * {@code BeanCreationException} → context refresh cancelled → the process exited 1. With the
 * gateway down, every proxied {@code /api/**} call from {@code ng serve} failed with
 * {@code AggregateError [ECONNREFUSED]} and no territories rendered.</p>
 *
 * <p>Only these two packages are needed:</p>
 * <ul>
 *   <li>{@code com.predicador.gateway} — this module's own config/controllers.</li>
 *   <li>{@code com.predicador.shared.security} — {@code SessionTokenService}, the only
 *       stereotype bean in {@code shared} ({@code @Service}), used by
 *       {@code AuthController} and {@code ReactiveSessionAuthFilter}. The rest of that
 *       package is enums/plain classes (no stereotype → not beans), and the servlet-only
 *       {@code SessionAuthFilter} carries no annotation, so it is correctly ignored here in
 *       favour of {@code ReactiveSessionAuthFilter}.</li>
 * </ul>
 *
 * <p>{@code com.predicador.shared.exception} (MVC advice) and
 * {@code com.predicador.shared.util} (static-only {@code PhoneUtil}, not a bean) are
 * intentionally excluded. The MVC services (territory, reporting) keep the wide scan and
 * legitimately need that advice.</p>
 *
 * <p>Regression guard: {@code ApiGatewayAppScanTest}.</p>
 */
@SpringBootApplication(scanBasePackages = { "com.predicador.gateway", "com.predicador.shared.security" })
public class ApiGatewayApp {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApp.class, args);
    }
}
