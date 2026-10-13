# CI / CD

- `ci-backend.yml`: Java 25 + PostGIS 16 (`predicador_test`); `mvn verify -Pcoverage -B`
- `ci-frontend.yml`: pnpm 9.15.0 + Node 22; `pnpm install --frozen-lockfile --ignore-scripts`; lint → build → test --coverage
- `security.yml`: gitleaks, OWASP dependency-check (fail CVSS=7), Trivy (CRITICAL/HIGH ignore-unfixed), Semgrep (ERROR + SARIF). Semanal Sun 03:00.
- `sonarcloud.yml`: `mapManagerToWeb_predicador-app`; `sonar-project.properties` (lcov + JaCoCo)
- `respaldo-bdd.yml`: diario 07:30 UTC + manual. SSH + `scripts/db/respaldo.sh`. Encriptación `age` con `.github/backup/age.pub`. 90 días.
- `docker.yml`: build & push GHCR (`mapManagerToWeb`). Tag `v*` trigger.
- `opencode.yml`: `opencode/mimo-v2.5-free` (OWNER/MEAMBER/COLLABORATOR).