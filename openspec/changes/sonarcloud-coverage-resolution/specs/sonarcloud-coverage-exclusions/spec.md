## Purpose

Configure SonarCloud to exclude non-testable classes (config, model, routing) from coverage metrics, ensuring coverage reports reflect actual testable code.

## ADDED Requirements

### Requirement: Exclude Spring Boot config classes from coverage
The system SHALL exclude Spring Boot configuration classes from SonarCloud coverage metrics using the `sonar.coverage.exclusions` property.

#### Scenario: Config classes excluded from coverage
- **WHEN** SonarCloud analyzes the codebase
- **THEN** classes matching `**/config/**`, `**/*Config.java`, and `**/*Application.java` SHALL NOT be counted in coverage metrics

### Requirement: Exclude model classes from coverage
The system SHALL exclude model/DTO classes from SonarCloud coverage metrics.

#### Scenario: Model classes excluded from coverage
- **WHEN** SonarCloud analyzes the codebase
- **THEN** classes matching `**/model/**/*.java` and `**/*Dto.java` SHALL NOT be counted in coverage metrics

### Requirement: Exclude Angular routing files from coverage
The system SHALL exclude Angular routing and configuration files from frontend coverage metrics.

#### Scenario: Angular routing files excluded from coverage
- **WHEN** SonarCloud analyzes the frontend codebase
- **THEN** files matching `**/app.routes.ts`, `**/app.config*.ts`, and `**/app.ts` SHALL NOT be counted in coverage metrics

### Requirement: Mark config classes with @Generated annotation
The system SHALL add `@Generated` annotations to Spring Boot config classes that don't require unit tests.

#### Scenario: Config classes marked as generated
- **WHEN** a Spring Boot config class is annotated with `@Generated`
- **THEN** SonarCloud SHALL exclude it from coverage analysis automatically

### Requirement: Verify coverage reports are picked up
The system SHALL verify that SonarCloud correctly picks up Jacoco XML reports and lcov.info reports.

#### Scenario: Coverage reports detected
- **WHEN** SonarCloud scanner runs
- **THEN** it SHALL detect coverage data from `backend/**/target/site/jacoco/jacoco.xml` and `territory-frontend/coverage/lcov.info`
