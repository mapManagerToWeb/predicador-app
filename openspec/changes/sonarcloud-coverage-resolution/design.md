## Context

The project uses SonarCloud for code quality gates. Coverage reports (Jacoco for Java, lcov for Angular) are genuine but include non-testable classes (config, model, routing) that show 0% coverage, artificially lowering metrics. The current `sonar-project.properties` is well-structured but lacks exclusions for these classes.

## Goals / Non-Goals

**Goals:**
- Exclude non-testable classes from SonarCloud coverage metrics
- Maintain coverage accuracy for testable code
- Ensure coverage reports are correctly picked up by SonarCloud scanner

**Non-Goals:**
- Write unit tests for config/model classes (not needed)
- Change test infrastructure or reporting
- Modify SonarCloud quality gate rules

## Decisions

### Decision 1: Use `sonar.coverage.exclusions` property

**Choice:** Add exclusion patterns to `sonar-project.properties`

**Rationale:**
- SonarCloud natively supports exclusion patterns
- No code changes needed for most classes
- Patterns are centralized in one configuration file

**Alternatives Considered:**
- `@Generated` annotation on each class: More invasive, requires code changes
- Separate SonarCloud projects: Overkill for this use case

### Decision 2: Exclude config classes via pattern

**Choice:** Exclude `**/config/**`, `**/*Config.java`, `**/*Application.java`

**Rationale:**
- Spring Boot config classes are infrastructure, not business logic
- They don't need unit tests (they're tested via integration tests)
- Pattern covers all current and future config classes

### Decision 3: Exclude model classes via pattern

**Choice:** Exclude `**/model/**/*.java`, `**/*Dto.java`

**Rationale:**
- Model/DTO classes are data structures, not behavior
- They're tested indirectly through service tests
- Pattern covers all current and future model classes

### Decision 4: Exclude Angular routing files

**Choice:** Exclude `**/app.routes.ts`, `**/app.config*.ts`, `**/app.ts`

**Rationale:**
- Angular routing files are configuration, not testable logic
- They're tested via E2E tests, not unit tests
- Pattern covers all current and future routing files

## Risks / Trade-offs

**Risk:** Over-exclusion reduces coverage visibility
**Mitigation:** Use specific patterns, not wildcards; review exclusions quarterly

**Risk:** New config/model classes not excluded automatically
**Mitigation:** Patterns use wildcards to catch future classes

**Risk:** SonarCloud scanner may not pick up new configuration
**Mitigation:** Verify coverage reports after implementation

## Migration Plan

1. Update `sonar-project.properties` with exclusion patterns
2. Add `@Generated` annotations to config classes (optional, for clarity)
3. Run SonarCloud scanner and verify coverage metrics improve
4. Document exclusion patterns in project README

## Open Questions

- Should we add `@Generated` annotations to config classes for extra clarity?
- Do we need to exclude any other file patterns (e.g., `**/dto/**/*.java`)?
