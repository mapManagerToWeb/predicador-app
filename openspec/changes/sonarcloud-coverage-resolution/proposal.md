## Why

SonarCloud coverage reports are genuine but incomplete. Config classes, model classes, and routing files show 0% coverage, which artificially lowers the overall coverage metric. This affects code quality gates and team morale. We need a systematic approach to either properly test these classes or exclude them from coverage metrics.

## What Changes

- Add `@Generated` annotations to Spring Boot config classes that don't need unit tests
- Configure SonarCloud exclusions for config classes, model classes, and Angular routing files
- Add exclusions for `*Config.java`, `*Application.java`, and `**/model/**/*.java`
- Add frontend exclusions for `app.routes.ts`, `app.config*.ts`
- Verify coverage reports are correctly picked up by SonarCloud scanner

## Capabilities

### New Capabilities
- `sonarcloud-coverage-exclusions`: Configure SonarCloud to exclude non-testable classes from coverage metrics

### Modified Capabilities

## Impact

- **Backend**: `sonar-project.properties` configuration changes
- **Frontend**: `sonar-project.properties` configuration changes
- **Java classes**: Add `@Generated` annotations to config classes (CacheConfig, OpenApiConfig, SecurityConfig, RetryConfig, RestClientConfig, RabbitMQConfig, WhatsAppProperties, AsyncConfig)
- **SonarCloud**: Coverage metrics will improve as non-testable classes are excluded
- **CI/CD**: No changes needed - SonarCloud scanner will pick up new configuration automatically
