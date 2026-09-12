# 🚕 TapRide — Event-Driven Ride Booking Platform

> A distributed ride-booking platform demonstrating event-driven microservices, Kafka-based Saga orchestration, distributed transaction handling, fault tolerance, and production-grade observability.

[![Frontend](https://img.shields.io/badge/Frontend-TapRide-46E3B7?style=flat&logo=render&logoColor=white)](https://tapride-frontend.onrender.com)
## 🛠️ Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Core & Framework** | Java 21, Spring Boot 3.3, Maven |
| **Messaging & Events** | Apache Kafka (KRaft) |
| **Data & Caching** | PostgreSQL, Valkey / Redis (Geospatial) |
| **Resilience & Testing** | Resilience4j, Testcontainers |
| **Observability** | Prometheus, Grafana, OpenTelemetry, Jaeger |
| **DevOps & Cloud** | Docker, Kubernetes, Aiven, Render |

---

## 🏗️ Architecture & Core Concepts

TapRide explores the engineering challenges that emerge when a single business action ("Book a Ride") cannot rely on a centralized ACID transaction. Instead, it coordinates distributed operations across autonomous microservices using a **Database-per-Service** pattern, **Kafka event streaming**, and **Saga Orchestration**.

```
                         ┌─────────────────────────────────────────┐
                         │              Order Service              │
                         │       (Saga Orchestrator / Postgres)    │
                         └──────────────────┬──────────────────────┘
                                            │
                                       Kafka Events
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
        ┌─────────────────────────┐                   ┌─────────────────────────┐
        │     Payment Service     │                   │    Matching Service     │
        │        (Postgres)       │                   │   (Postgres + Valkey)   │
        └─────────────────────────┘                   └─────────────────────────┘
```

### Key Engineering Highlights
* **Event-Driven Architecture:** Services communicate asynchronously via Kafka topics, decoupling execution and enabling independent deployment.
* **Distributed Transactions (Saga Pattern):** The `Order Service` acts as the orchestrator, managing state transitions and triggering **compensating actions** (e.g., automated refunds) if downstream services fail.
* **Geospatial Matching & Simulation:** Uses Valkey/Redis (`GEOADD`, `GEOSEARCH`) to index driver locations and run periodic simulated driver routes toward pickup zones.
* **End-to-End Observability:** Distributed tracing via OpenTelemetry and Jaeger tracks requests end-to-end across HTTP and Kafka boundaries.

---

## 🔄 End-to-End Ride Lifecycle & Saga Flow

### Happy Path Sequence

```
Ride Requested ──> Payment Authorized ──> Driver Matched ──> Driver Approaching ──> Trip Started ──> Trip Completed
```

### Failure & Compensation Sequence (Chaos Path)

When driver matching fails or times out, the Saga orchestrator automatically rolls back state by issuing a refund compensation:

```
Ride Requested ──> Payment Authorized ──> Driver Matching ❌ ──> Payment Refund ──> Ride Cancelled
```

---

## 🧩 Microservices Breakdown

* **`order-service`**
  * Serves as the Saga orchestrator and owns the ride state machine.
  * Handles ride creation, fare estimation, WebSocket updates, and timeline history.
* **`payment-service`**
  * Saga participant managing payment authorizations, state tracking, and refunds.
  * Contains configurable failure simulation endpoints for chaos testing.
* **`matching-service`**
  * Manages driver availability, geospatial indexing via Valkey/Redis, and driver assignments.
  * Runs background tasks to publish `DRIVER_LOCATION_UPDATED` events.

---

## 💥 Chaos Testing & Resilience

TapRide features built-in failure injection endpoints to simulate transient and permanent distributed failures:

* **Resilience4j Integration:** Implements Circuit Breakers and Retry policies.
* **Failure Filtering:** Excludes non-infrastructure errors (e.g., `404 Not Found`) from impacting circuit breaker failure rates.
* **Chaos Endpoints:** Inject payment rejections or matching timeouts to observe real-time Saga rollback and compensation in the live dashboard.

---

## 📊 Observability Stack

```
                          ┌──────────────────┐
                          │    Services      │
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
         Prometheus          OpenTelemetry             Logs
              │                    │
              ▼                    ▼
           Grafana               Jaeger
```

* **Prometheus & Grafana:** Monitors application metrics, throughput, error rates, and JVM performance.
* **OpenTelemetry & Jaeger:** Tracks cross-service request propagation through Kafka events and REST APIs.

---

## 📁 Repository Structure

```
TapRide-Backend/
├── order-service/        # Saga Orchestrator & Ride Lifecycle
│   ├── src/
│   └── pom.xml
├── payment-service/      # Payment Processing & Refunds
│   ├── src/
│   └── pom.xml
├── matching-service/     # Geospatial Driver Search & Simulation
│   ├── src/
│   └── pom.xml
├── k8s/                  # Kubernetes Deployment Manifests
├── docker-compose.yml    # Local Infrastructure Stack
├── pom.xml               # Parent POM (Dependency Management)
└── README.md
```

> **Note:** The root POM provides centralized dependency management via `<dependencyManagement>`, while each service maintains its own independent build lifecycle for true microservice deployment autonomy.

---

## 🚀 Local Development Setup

### Prerequisites
* **Java 21** & **Maven 3.8+**
* **Docker Engine** & **Docker Compose**

### Running the Stack

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/TapRide-Backend.git
   cd TapRide-Backend
   ```

2. **Start all services and infrastructure:**
   ```bash
   docker compose up -d
   ```

3. **Verify running containers:**
   ```bash
   docker compose ps
   ```

4. **Access Local Interfaces:**
   * **Dashboard:** `http://localhost:3000`
   * **Kafka UI:** `http://localhost:8080`
   * **Grafana:** `http://localhost:3001`
   * **Jaeger UI:** `http://localhost:16686`

---

## 🧪 Integration Testing

TapRide uses **Testcontainers** to execute end-to-end integration tests against real infrastructure dependencies (PostgreSQL and Kafka instances) rather than relying on in-memory mocks.

Run tests across all services:
```bash
mvn clean test
```

---

## ☸️ Cloud & Kubernetes Deployment

* **Kubernetes:** Manifests inside `/k8s` support standard deployments, services, and environment configurations.
* **Cloud Architecture:**
  * **Application Services:** Deployed on **Render** (Order, Payment, Matching Services & Frontend).
  * **Managed Infrastructure:** Hosted via **Aiven** (Apache Kafka, PostgreSQL, Valkey).

---

## 🔮 Future Improvements

* [ ] Temporal Workflows for long-running orchestration.
* [ ] Schema Registry with Avro / Protobuf event contracts.
* [ ] Transactional Outbox Pattern with Change Data Capture (CDC).
* [ ] Dead Letter Queue (DLQ) & retry topic strategies.
* [ ] Kubernetes Horizontal Pod Autoscaler (HPA).