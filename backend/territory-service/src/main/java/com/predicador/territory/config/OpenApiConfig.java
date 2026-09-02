package com.predicador.territory.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import jakarta.annotation.Generated;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Generated("com.predicador.territory.config.OpenApiConfig")
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI territoryOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Territory Service API")
                        .description("API para gestión de territorios y GeoJSON")
                        .version("1.0"));
    }
}
