package com.tapride.order.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the frontend (running on a different origin than this API - a
 * different port under docker-compose, a different host entirely under the
 * k8s Ingress) to call this API. Without this, every fetch() call from the
 * browser fails with a generic "Failed to fetch" error, even though the
 * request never reaches this service at all - the browser blocks it before
 * sending, per CORS rules.
 *
 * Both origins are allowed so the SAME built image works whether it's run
 * via docker-compose (frontend on localhost:8085) or deployed to k8s
 * (frontend behind the tapride.local Ingress host - see k8s/README.md).
 */
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
