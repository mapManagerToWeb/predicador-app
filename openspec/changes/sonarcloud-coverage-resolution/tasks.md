## 1. SonarCloud Configuration

- [x] 1.1 Add `sonar.coverage.exclusions` property to `sonar-project.properties` with patterns for config, model, and routing files
- [x] 1.2 Add `sonar.javascript.lcov.exclusions` property for Angular routing files
- [x] 1.3 Verify exclusion patterns are correct by running SonarCloud scanner locally

## 2. Java Config Class Annotations (Optional)

- [x] 2.1 Add `@Generated` annotation to `CacheConfig.java` in territory-service
- [x] 2.2 Add `@Generated` annotation to `OpenApiConfig.java` in territory-service
- [x] 2.3 Add `@Generated` annotation to `SecurityConfig.java` in territory-service
- [x] 2.4 Add `@Generated` annotation to `RetryConfig.java` in territory-service
- [x] 2.5 Add `@Generated` annotation to `RestClientConfig.java` in reporting-service
- [x] 2.6 Add `@Generated` annotation to `SecurityConfig.java` in reporting-service
- [x] 2.7 Add `@Generated` annotation to `RabbitMQConfig.java` in reporting-service
- [x] 2.8 Add `@Generated` annotation to `OpenApiConfig.java` in reporting-service
- [x] 2.9 Add `@Generated` annotation to `WhatsAppProperties.java` in reporting-service
- [x] 2.10 Add `@Generated` annotation to `AsyncConfig.java` in reporting-service

## 3. Verification

- [x] 3.1 Run SonarCloud scanner and verify coverage metrics improve
- [x] 3.2 Verify coverage reports are correctly picked up from `backend/**/target/site/jacoco/jacoco.xml`
- [x] 3.3 Verify coverage reports are correctly picked up from `territory-frontend/coverage/lcov.info`
- [x] 3.4 Document exclusion patterns in project README
