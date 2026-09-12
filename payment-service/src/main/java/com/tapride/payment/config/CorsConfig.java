package com.tapride.payment.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.beans.factory.annotation.Value;

/**
 * Allows the frontend (running on a different origin than this API - a
 * different port under docker-compose, a different host under the k8s
 * Ingress, or a different onrender.com domain entirely once deployed) to
 * call this API. Without this, every fetch() call from the browser fails
 * with a generic "Failed to fetch" error, even though the request never
 * reaches this service at all - the browser blocks it before sending, per
 * CORS rules.
 *
 * Allowed origins are read from an environment variable rather than
 * hardcoded - Render assigns each service's public URL at creation time
 * (something like https://tapride-frontend-xyz1.onrender.com), which isn't
 * known until after first deploy. Hardcoding a guessed URL here would mean
 * rebuilding the image every time it turned out wrong; reading it from
 * config means it's just a dashboard env var to fix, no rebuild needed.
 *
 * Defaults cover local dev (docker-compose) and the k8s Ingress host, so
 * nothing breaks for either of those if the env var isn't set.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {
   
    @Value("${app.cors.allowed-origins}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("*");
    }
}
