# Backup

La base vive en el VPS, así que se respalda **fuera** de él todas las noches (`.github/workflows/respaldo-bdd.yml`, ADR 0012):

1. GitHub Actions entra al VPS por SSH con una llave que **solo** puede ejecutar `scripts/db/respaldo.sh` (comando forzado).
2. El script hace `pg_dump` dentro del contenedor `postgres` y lo cifra con [age](https://age-encryption.org) para las llaves públicas de `.github/backup/age.pub` antes de que salga del VPS.
3. El archivo cifrado queda 90 días como artefacto del workflow (Actions → «Respaldo de la base de datos» → la ejecución → *Artifacts*). Sin una llave privada no se puede abrir, aunque el repositorio sea público.

Además, en el VPS se pueden guardar copias locales (las últimas 14) con `scripts/db/respaldo.sh local`, en `backups/`.

## Configurarlo (una vez)

En el VPS:

```bash
scripts/db/instalar-age.sh        # age (cifrado) dentro del proyecto, sin sudo
# Llave SSH solo para los respaldos (sin contraseña: la usa GitHub).
ssh-keygen -t ed25519 -N "" -C github-respaldo -f ~/.ssh/respaldo_github
# Autorizarla SOLO para respaldar (comando forzado, sin terminal ni túneles).
echo "command=\"$HOME/predicador-app/scripts/db/respaldo.sh stdout\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat ~/.ssh/respaldo_github.pub)" >> ~/.ssh/authorized_keys
# Datos para los secrets de GitHub:
cat ~/.ssh/respaldo_github                                               # → VPS_SSH_KEY
echo "IP_DEL_VPS $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"    # → VPS_SSH_KNOWN_HOSTS (con la IP real)
rm ~/.ssh/respaldo_github                                                # la privada solo debe quedar en GitHub
# Copia local diaria (opcional):
(crontab -l 2>/dev/null; echo "0 3 * * * $HOME/predicador-app/scripts/db/respaldo.sh local >> $HOME/predicador-app/backups/respaldo.log 2>&1") | crontab -
```

En GitHub (Settings → Secrets and variables → Actions → *New repository secret*):
`VPS_HOST` (IP del VPS), `VPS_USER` (usuario del VPS), `VPS_SSH_KEY` y
`VPS_SSH_KNOWN_HOSTS`. Después, Actions → «Respaldo de la base de datos» →
*Run workflow* para probarlo.

**Llaves de cifrado**: cada línea de `.github/backup/age.pub` es una persona que puede abrir los respaldos. La llave privada (`AGE-SECRET-KEY-…`, creada con `age-keygen`) se guarda en dos lugares seguros **fuera** del VPS y del repositorio; si se pierden todas, los respaldos no se pueden abrir.

## Restaurar

```bash
# Revisar un respaldo sin tocar producción (lo carga en la base predicador_restaurada):
scripts/db/restaurar.sh predicador-AAAAMMDD-HHMMSS.dump.age ~/llave-privada.txt
# Emergencia / servidor nuevo: reemplaza la base `predicador` (pide escribir REEMPLAZAR):
scripts/db/restaurar.sh predicador-AAAAMMDD-HHMMSS.dump.age ~/llave-privada.txt --reemplazar
```

En un servidor nuevo: clonar el repo, crear `.env`, `docker compose up -d postgres`, restaurar con `--reemplazar` y después `docker compose up -d --build`.

## Notas

- Producción: contenedor `postgres` del compose, self-hosted (ADR 0006, reemplazó Neon).
- Nunca modificar `.env` ni `application-local.yml` en el repo (gitignored).
