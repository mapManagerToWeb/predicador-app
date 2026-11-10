# Configuración

- `.env` (gitignored): `SESSION_SECRET`, `ADMIN_PASSWORD_BCRYPT`, `DB_*`. Compose exige `DB_PASSWORD`, `SESSION_SECRET` y `ADMIN_USERNAME` (falla al arrancar sin ellos); `DB_URL`/`DB_USERNAME` tienen defaults al contenedor.
- `application-local.yml` (gitignored): profile `local` (secreto vacío permitido).
- `config-server`: `native` profile (classpath), sin URI de repo git.
- `SPRING_PROFILES_ACTIVE`: debe ser `native` en compose; cualquier otro intenta un repo git sin URI → falla.
- `DB_URL_UNPOOLED`: conexión directa para Flyway. Nació con Neon/PgBouncer; con el Postgres self-hosted el valor suele ser igual a `DB_URL`, pero la variable se mantiene por compatibilidad.
- `SESSION_STRICT` (default `true`): fuera de `local`, `SessionTokenService` exige un secreto ≥32 bytes y `ADMIN_PASSWORD_BCRYPT`.
- `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE`: compose las pone en `true` por defecto; `.env.example` las deja en `false` para desarrollo por HTTP. Activar en producción detrás de HTTPS.
- `PORTAINER_URL`: opcional; habilita el botón «Abrir Portainer» del panel «Sistema». Vacío = sin botón.
- `WHATSAPP_DEFAULT_IMAGE_URL`: opcional; imagen del encabezado al anunciar un territorio completado.
- `NEON_URL`: solo para la importación inicial de `db-import`; se ignora si la base ya tiene datos.
