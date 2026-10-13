# Configuración

- `.env` (gitignored): `SESSION_SECRET`, `ADMIN_PASSWORD_BCRYPT`, `DB_*`. Solo `DB_PASSWORD` obligatorio; `DB_URL`/`DB_USERNAME` defaults al container.
- `application-local.yml` (gitignored): profile `local` (secreto vacío permitido).
- `config-server`: `native` profile (classpth), no git repo URI.
- `SPRING_PROFILES_ACTIVE`: debe ser `native` en compose; cualquier otro intenta repo git sin URI → falla.
- `DB_URL_UNPOOLED`: directo para Flyway con Neon (no pooled).