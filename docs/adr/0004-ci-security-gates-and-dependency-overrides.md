# ADR 0004: CI security gates and dependency version overrides

## Status

Accepted

## Context

The Trivy image-scan gate failed on HIGH/CRITICAL CVEs in transitive
dependencies shipped by Spring Boot / Spring Cloud: Tomcat, Netty, pgjdbc,
BouncyCastle, and spring-cloud-config-server. These had to be handled without
waiting for the managed versions to catch up.

## Decision

- **(a) Dependency overrides in `backend/pom.xml`:** `tomcat.version 11.0.25`
  (`:27`), `netty.version 4.2.17.Final` (`:26`), pgjdbc 42.7.12 (`:93-97`),
  bouncycastle bcprov 1.84 (`:98-102`), spring-cloud-config-server 5.0.5
  (`:103-108`).
- **(b) GitHub Actions hardening:** actions pinned by full commit SHA, e.g.
  `actions/checkout@d23441a...` (v6.1.0, `ci-backend.yml:39`), with the tag in
  a comment for readability.
- **(c) Existing gates kept:** gitleaks (skips dependabot runs), OWASP
  dependency-check with `failBuildOnCVSS=7` (non-blocking report), Trivy image
  scan (HIGH/CRITICAL, `ignore-unfixed`, exit-code 1), Semgrep
  (security-audit + owasp-top-ten + github-actions, gates on ERROR), weekly
  Sunday 03:00 cron.
- **(d) Neon backup:** on `main` pushes, `ci-backend.yml` dumps the production
  DB as an AGE-encrypted artifact (30-day retention; public key
  `.github/backup/age.pub`, decryptor held by the owner).

## Consequences

- The Trivy gate is green while keeping the security tooling active.
- Dependabot-triggered runs lose repo secrets, so gitleaks and Semgrep are
  skipped for them (as before).
- The version overrides must be maintained in the parent POM; revisit when
  Spring Boot / Spring Cloud ship fixed managed versions.