FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY shared/pom.xml shared/
COPY config-server/pom.xml config-server/
COPY discovery-server/pom.xml discovery-server/
COPY api-gateway/pom.xml api-gateway/
COPY territory-service/pom.xml territory-service/
COPY reporting-service/pom.xml reporting-service/
RUN mvn dependency:go-offline -pl api-gateway -am -B
COPY . .
RUN mvn clean package -pl api-gateway -am -Dmaven.test.skip=true -B

FROM eclipse-temurin:25-jre-alpine
RUN apk upgrade --no-cache \
    && addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /workspace/api-gateway/target/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
