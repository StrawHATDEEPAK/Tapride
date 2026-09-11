package com.tapride.matching.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Same rationale as order-service's CorsConfig - see that class for the full explanation. */
@Configuration
public class CorsConfig implements WebMvcConfigurer {
   
    private final String[] allowedOrigins = {
            "http://localhost:8085",
            "https://tapride.local",
            "http://tapride.local"
    };

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("*");

        registry.addMapping("/actuator/health")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET");
    }
}
