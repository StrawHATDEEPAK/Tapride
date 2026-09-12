package com.tapride.notification.config;

import org.apache.kafka.clients.CommonClientConfigs;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.config.SaslConfigs;
import org.apache.kafka.common.config.SslConfigs;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * Consumer-only Kafka configuration.
 *
 * notification-service only consumes events from Kafka and pushes them
 * to connected WebSocket clients. It does not publish Kafka events.
 *
 * Supports:
 * - Local Docker Kafka using PLAINTEXT
 * - Hosted Kafka using SASL/SSL authentication
 */
@Configuration
@EnableKafka
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${spring.kafka.security.protocol:PLAINTEXT}")
    private String securityProtocol;

    @Value("${spring.kafka.sasl.mechanism:}")
    private String saslMechanism;

    @Value("${spring.kafka.sasl.jaas-config:}")
    private String saslJaasConfig;

    @Value("${spring.kafka.ssl.truststore-certificates:}")
    private String truststoreCertificates;

    private void applyClusterAuthConfig(Map<String, Object> config) {
        config.put(
                CommonClientConfigs.SECURITY_PROTOCOL_CONFIG,
                securityProtocol
        );

        if (StringUtils.hasText(saslMechanism)) {
            config.put(
                    SaslConfigs.SASL_MECHANISM,
                    saslMechanism
            );

            config.put(
                    SaslConfigs.SASL_JAAS_CONFIG,
                    saslJaasConfig
            );
        }

        if (StringUtils.hasText(truststoreCertificates)) {
            config.put(
                    SslConfigs.SSL_TRUSTSTORE_TYPE_CONFIG,
                    "PEM"
            );

            config.put(
                    SslConfigs.SSL_TRUSTSTORE_CERTIFICATES_CONFIG,
                    truststoreCertificates
            );
        }
    }

    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> config = new HashMap<>();

        config.put(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG,
                bootstrapServers
        );

        config.put(
                ConsumerConfig.GROUP_ID_CONFIG,
                "notification-service"
        );

        config.put(
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
                StringDeserializer.class
        );

        config.put(
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
                StringDeserializer.class
        );

        config.put(
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,
                "earliest"
        );

        applyClusterAuthConfig(config);

        return new DefaultKafkaConsumerFactory<>(config);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String>
    kafkaListenerContainerFactory() {

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();

        factory.setConsumerFactory(consumerFactory());

        // Continue the distributed OpenTelemetry trace from
        // the Kafka message headers.
        factory.getContainerProperties().setObservationEnabled(true);

        return factory;
    }
}