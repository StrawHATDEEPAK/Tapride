package com.tapride.order.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.clients.CommonClientConfigs;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.config.SaslConfigs;
import org.apache.kafka.common.config.SslConfigs;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.*;
import org.springframework.kafka.support.serializer.JsonSerializer;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

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
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> config = new HashMap<>();

        config.put(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG,
                bootstrapServers
        );

        config.put(
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,
                StringSerializer.class
        );

        config.put(
                ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG,
                true
        );

        config.put(
                ProducerConfig.ACKS_CONFIG,
                "all"
        );

        config.put(
                JsonSerializer.ADD_TYPE_INFO_HEADERS,
                false
        );

        // Configure Jackson explicitly so java.time types such as Instant
        // are serialized as ISO-8601 strings rather than numeric timestamps.
        ObjectMapper kafkaObjectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        applyClusterAuthConfig(config);

        return new DefaultKafkaProducerFactory<>(
                config,
                new StringSerializer(),
                new JsonSerializer<>(kafkaObjectMapper)
        );
    }

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        KafkaTemplate<String, Object> template =
                new KafkaTemplate<>(producerFactory());

        // Propagate OpenTelemetry trace context through Kafka headers.
        template.setObservationEnabled(true);

        return template;
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
                "order-service"
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