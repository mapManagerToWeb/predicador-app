# ADR 0012: Daily encrypted database backup outside the VPS

## Status

Accepted

## Context

Since ADR 0006 the production database runs in the `postgres` container of an
Oracle Cloud free-tier VPS. The free plan can change or the machine can be
reclaimed at any time; the code is on GitHub and the server can be rebuilt,
but the data cannot. The only backup job (`ci-backend.yml`) still dumped Neon,
which is no longer used, and failed.

## Decision

- A scheduled GitHub Actions workflow (`respaldo-bdd.yml`, daily + manual)
  pulls the backup over SSH. The key is authorized on the VPS with a forced
  command (`scripts/db/respaldo.sh stdout`, no pty/forwarding): whatever the
  client asks, it can only receive the backup. The host key is pinned
  (`VPS_SSH_KNOWN_HOSTS`).
- `respaldo.sh` runs `pg_dump --format=custom` inside the container (same
  version as the server) and encrypts the stream with age for every recipient
  in `.github/backup/age.pub` **before it leaves the VPS**; the plaintext never
  touches a disk. The repo is public and anyone logged in can download
  artifacts, so encryption is what protects the data.
- Artifacts are kept 90 days. The workflow fails if the file is not an age
  file or is suspiciously small.
- Optional local copies on the VPS (`respaldo.sh local`, last 14) for quick
  restores.
- `restaurar.sh` restores into a separate database by default
  (`predicador_restaurada`) and prints row counts; `--reemplazar` replaces the
  production database (disaster recovery). Verified end to end on a copy of
  production: identical row counts, geometry/report/encargado fingerprints
  and Flyway histories.

## Consequences

- Each person who must be able to restore needs their own age key; losing all
  private keys makes the backups useless.
- GitHub disables scheduled workflows in public repositories after 60 days
  without activity; a push or a manual run re-enables them.
- The encrypted dump is ~400 KB today, far below GitHub's artifact limits.
