FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY shared/pom.xml shared/
COPY config-server/pom.xml config-server/
COPY discovery-server/pom.xml discovery-server/
COPY api-gateway/pom.xml api-gateway/
COPY territory-service/pom.xml territory-service/
COPY reporting-service/pom.xml reporting-service/
RUN mvn dependency:go-offline -pl config-server -am -B
COPY . .
RUN mvn clean package -pl config-server -am -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /workspace/config-server/target/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8888
ENTRYPOINT ["java", "-jar", "app.jar"]
