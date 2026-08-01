package com.predicador.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Locks down the config-server documents.
 *
 * <p>Config documents can contain structure and non-secret defaults that are
 * useful reconnaissance for an attacker (service names, ports, profile
 * layout). By default the config-server serves them to any client that can
 * reach {@code :8888}. When {@code CONFIG_SERVER_USERNAME} and
 * {@code CONFIG_SERVER_PASSWORD} are set, this config requires HTTP Basic
 * auth on everything except {@code /actuator/health}. Downstream services
 * pass the same credentials via {@code spring.cloud.config.username/password}.
 * Without credentials the server stays open so local development is
 * unaffected.</p>
 */
@Configuration
public class ConfigServerSecurityConfig {

    @Bean
    public SecurityFilterChain configServerFilterChain(HttpSecurity http,
            @Value("${app.config.username:}") String username,
            @Value("${app.config.password:}") String password) throws Exception {
        boolean secured = username != null && !username.isBlank()
                && password != null && !password.isBlank();

        http.csrf(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/actuator/health", "/actuator/health/**").permitAll();
                    if (secured) {
                        auth.anyRequest().authenticated();
                    } else {
                        auth.anyRequest().permitAll();
                    }
                });

        if (secured) {
            http.httpBasic(Customizer.withDefaults());
        }

        return http.build();
    }

    @Bean
    public UserDetailsService configServerUsers(
            @Value("${app.config.username:}") String username,
            @Value("${app.config.password:}") String password,
            PasswordEncoder passwordEncoder) {
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            return new InMemoryUserDetailsManager();
        }
        UserDetails user = User.withUsername(username)
                .password(passwordEncoder.encode(password))
                .roles("CONFIG")
                .build();
        return new InMemoryUserDetailsManager(user);
    }

    @Bean
    public PasswordEncoder configServerPasswordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
