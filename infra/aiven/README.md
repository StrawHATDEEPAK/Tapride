# Deploying TapRide's data layer to Aiven (free tier)

This documents switching Kafka, Postgres, and Redis from docker-compose's
local containers to Aiven's free-tier managed services — real infrastructure,
no credit card, but with real trade-offs (idle auto-shutdown, one free
instance per service type) documented honestly below.

**Important**: this covers the *data layer only* (Kafka, Postgres, Valkey).
The 5 application services (order/payment/matching/notification-service +
frontend) still need separate compute hosting — that decision is tracked
separately, not covered in this doc.

---

## Why Kafka needed code changes but Postgres/Redis didn't

Postgres and Redis connections are fully configured via environment variables
that docker-compose already overrides (`SPRING_DATASOURCE_URL`,
`SPRING_DATA_REDIS_HOST`, etc.) — Spring Boot's autoconfiguration for both
already supports SSL and password auth out of the box via properties like
`spring.data.redis.ssl.enabled`. Pointing at Aiven instead of a local
container is purely a connection-string change.

Kafka was different: our `KafkaConfig.java` in all 4 services builds its own
`ProducerFactory`/`ConsumerFactory` manually (a deliberate choice from Day 1,
since we parse events as raw JSON rather than binding to shared Java types —
see each service's own class comments). That meant SASL_SSL support had to be
added to that manual config directly. See each service's `KafkaConfig.java`
for the actual implementation — it supports both plaintext (local) and
SASL_SSL (Aiven) from the same code, switched purely by which environment
variables are set.

---

## 1. Kafka setup

1. Create a free Aiven for Apache Kafka service (aiven.io — no card required).
2. In the service's **Overview** page, under **Authentication method**,
   choose **SASL** (not the default client-certificate method — SASL is
   simpler to configure from a containerized Spring Boot app, since it
   avoids needing to manage a client keystore file).
3. Download `ca.pem` from the same page — this is the CA certificate content
   you'll use as the truststore.
4. Note the SASL username, password, and the exact mechanism shown
   (typically `SCRAM-SHA-256`).

Set these environment variables on **all 4 services**
(order/payment/matching/notification-service):

```
SPRING_KAFKA_BOOTSTRAP_SERVERS=<your-service>.aivencloud.com:PORT
SPRING_KAFKA_SECURITY_PROTOCOL=SASL_SSL
SPRING_KAFKA_SASL_MECHANISM=SCRAM-SHA-256
SPRING_KAFKA_SASL_JAAS_CONFIG=org.apache.kafka.common.security.scram.ScramLoginModule required username="YOUR_USER" password="YOUR_PASSWORD";
SPRING_KAFKA_SSL_TRUSTSTORE_CERTIFICATES=<paste the FULL contents of ca.pem here, including the BEGIN/END CERTIFICATE lines>
```

**Never commit these values to git** — they belong in your hosting
platform's secret/environment-variable manager, not in `application.yml`.

---

## 2. Postgres setup

1. Create a free Aiven for PostgreSQL service.
2. Connect once with `psql` (connection details on the service's Overview
   page) and create the 3 separate databases this project needs — **one free
   Aiven Postgres service, three databases inside it**, since the free tier
   only allows one Postgres service per account (a documented consolidation,
   same "physical instance, logical separation" trade-off used elsewhere in
   this project):

```sql
CREATE DATABASE order_db;
CREATE DATABASE payment_db;
CREATE DATABASE matching_db;
```

3. Set these per service (same variable names as docker-compose already
   uses, just pointing somewhere new):

```
# order-service
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/order_db?sslmode=require
SPRING_DATASOURCE_USERNAME=<aiven-provided-user>
SPRING_DATASOURCE_PASSWORD=<aiven-provided-password>

# payment-service - same host/port/user/password, different database name
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/payment_db?sslmode=require

# matching-service - same host/port/user/password, different database name
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/matching_db?sslmode=require
```

`sslmode=require` encrypts the connection (Aiven requires this) without
needing a separate truststore file — sufficient for this project.

---

## 3. Redis → Valkey setup

Aiven's managed Redis-compatible service is called Valkey (a Linux
Foundation fork of Redis, maintaining full command compatibility — including
`GEOADD`/`GEOSEARCH`, the only Redis features `matching-service` actually
uses, so this is a genuine drop-in swap).

1. Create a free Aiven for Valkey service.
2. Set on `matching-service` only:

```
SPRING_DATA_REDIS_HOST=<your-service>.aivencloud.com
SPRING_DATA_REDIS_PORT=<port>
SPRING_DATA_REDIS_PASSWORD=<aiven-provided-password>
SPRING_DATA_REDIS_SSL_ENABLED=true
```

No code changes needed — Spring Boot's Redis autoconfiguration already
supports all of these properties.

---

## 4. The keep-alive problem

Both Aiven Kafka and Aiven Postgres free-tier services **power off
automatically after 24 hours of no activity** (Kafka: no produce/consume;
Postgres: no queries). A public demo with sparse, unpredictable visitor
traffic will hit this regularly without a keep-alive mechanism.

See `.github/workflows/aiven-keepalive.yml` — a scheduled GitHub Actions
workflow (runs every 12 hours, comfortably under the 24h threshold) that:
- Sends a trivial heartbeat message to Kafka via Aiven's REST Proxy (a
  plain HTTPS POST — no Kafka client library needed for this)
- Runs a trivial `SELECT 1` against Postgres to keep it active too

Required repo secrets (GitHub repo → Settings → Secrets and variables →
Actions):
```
AIVEN_KAFKA_REST_URL       (e.g. https://your-service.aivencloud.com:PORT)
AIVEN_KAFKA_USER
AIVEN_KAFKA_PASSWORD
AIVEN_POSTGRES_URL         (a standard postgres:// connection string)
```

---

## What's still open

- **Compute hosting** for the 5 application services themselves — not yet decided.
- If a chosen compute platform *also* sleeps on inactivity (common for free
  tiers), the keep-alive workflow above should be extended to ping those
  services' `/actuator/health` endpoints too — same pattern, just more targets.
