package com.tapride.notification.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * notification-service never needed CORS before now - its only real traffic
 * is the WebSocket connection (already handled separately via
 * setAllowedOriginPatterns("*") in WebSocketConfig). This is purely for the
 * frontend's server-health panel, which polls /actuator/health directly via
 * fetch() - a completely different request path than the WebSocket upgrade.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins:http://localhost:8085,http://tapride.local}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/actuator/health")
                .allowedOrigins(allowedOrigins.split(","))
                .allowedMethods("GET");
    }
}
