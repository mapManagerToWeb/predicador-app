# Hallazgos críticos

## 1. Autenticación backend fail-open sin `SESSION_SECRET`

- **Ubicación:** `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java:62-67`; configuraciones con `${SESSION_SECRET:}` en `backend/config-server/src/main/resources/config/*.yml`.
- **Descripción:** Cuando el secreto está vacío, el filtro permite pasar las rutas protegidas en modo compatibilidad.
- **Impacto:** Un despliegue mal configurado puede dejar expuestas mutaciones, reportes y datos personales sin token.
- **Recomendación:** Fallar el arranque fuera de un perfil local explícito si el secreto falta o no cumple una longitud mínima. Añadir una prueba que confirme el comportamiento fail-closed.
- **Esfuerzo:** S

## 2. Credenciales administrativas triviales por defecto

- **Ubicación:** `docker-compose.yml:20-22,61-64`; `backend/api-gateway/src/main/java/com/predicador/gateway/config/AuthController.java:38-45,83-86`.
- **Descripción:** `ADMIN_USERNAME` y `ADMIN_PASSWORD` tienen fallback `admin`; el gateway admite el fallback plano.
- **Impacto:** Cualquier despliegue iniciado sin `.env` puede aceptar credenciales administrativas conocidas.
- **Recomendación:** Eliminar los defaults, exigir `ADMIN_PASSWORD_BCRYPT` en entornos no locales y abortar el arranque si falta.
- **Esfuerzo:** S

## 3. Esquema mutable en runtime junto con Flyway

- **Ubicaciones:** `territory-service/src/main/resources/application.yml:25`, `reporting-service/src/main/resources/application.yml:20`, y configuraciones equivalentes del Config Server.
- **Descripción:** `ddl-auto: update` permite que Hibernate modifique el esquema mientras Flyway también administra migraciones.
- **Impacto:** Drift de esquema y cambios no versionados en producción.
- **Recomendación:** Usar `validate` o `none` fuera de tests/local; dejar Flyway como única autoridad.
- **Esfuerzo:** S
