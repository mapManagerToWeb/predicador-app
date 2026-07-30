FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY shared/pom.xml shared/
COPY config-server/pom.xml config-server/
COPY discovery-server/pom.xml discovery-server/
COPY api-gateway/pom.xml api-gateway/
COPY territory-service/pom.xml territory-service/
COPY reporting-service/pom.xml reporting-service/
RUN mvn dependency:go-offline -pl territory-service -am -B
COPY . .
RUN mvn clean package -pl territory-service -am -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /workspace/territory-service/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
