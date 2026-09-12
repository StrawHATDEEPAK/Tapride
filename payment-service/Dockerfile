# NOTE: build context for this Dockerfile is the REPO ROOT (see docker-compose.yml),
# because payment-service/pom.xml inherits from the root parent POM.

# --- Build stage ---
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml .
COPY payment-service/pom.xml payment-service/pom.xml
RUN mvn -B -f payment-service/pom.xml dependency:go-offline

COPY payment-service/src payment-service/src
RUN mvn -B -f payment-service/pom.xml clean package -DskipTests

# --- Runtime stage ---
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S tapride && adduser -S tapride -G tapride
COPY --from=build /app/payment-service/target/payment-service.jar app.jar
USER tapride

EXPOSE 8080
# -Xmx256m / -Xss512k: Render's free tier caps containers at 512MB RAM total -
# the JVM's own default heap sizing (up to 25% of container memory) leaves no
# room for metaspace, thread stacks, or native/off-heap memory (Kafka client
# buffers, Postgres driver, etc) once you add those on top. Explicit tuning
# here is what makes this actually fit, not just "usually fits."
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-Xmx256m", "-Xss512k", \
            "-XX:MaxMetaspaceSize=128m", "-jar", "app.jar"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1
