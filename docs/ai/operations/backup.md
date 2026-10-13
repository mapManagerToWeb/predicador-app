# Backup

- Script: `scripts/db/respaldo.sh`
  - Dump `pg_dump` (territory + reporting)
  - Encriptación `age` con claves `.github/backup/age.pub` (repo público → safe)
  - Artefacto: 90 días

- Restaurar: `scripts/db/restaurar.sh <artifact>` → descarga, desencripta, restaura

- Producción: Neon serverless; local: `postgres/postgis` compose
- Nunca modificar `.env` ni `application-local.yml` en repo (gitignored)