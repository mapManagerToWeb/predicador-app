# Seguridad

## Estado

- **Bien:** HMAC-SHA256 con comparación constante, BCrypt disponible, CORS con orígenes configurables, validación Bean Validation, rate limiting, interceptor que no añade token a orígenes externos y `.env` ignorado.
- **Crítico:** `SESSION_SECRET` vacío desactiva la autenticación backend; credenciales `admin/admin` por defecto.
- **Alto:** servicios internos, Config Server y gestión publicados; autorización por propietario incompleta; `isAdmin` y perfil manipulables en `localStorage`; token frontend en `localStorage`.
- **Medio:** faltan CSP/HSTS visibles, contenedores root, tags sin digest y observabilidad expuesta.

## Infraestructura

Los puertos `8888`, `8761`, `8081`, `8082`, `4317`, `4318`, `16686`, `14268`, `9090` y `3000` se publican en Compose. En desarrollo puede ser intencional, pero en despliegue compartido permite saltarse el gateway o acceder a herramientas administrativas. Separar perfiles/redes y publicar únicamente interfaces necesarias.

No se reportan CVE porque no se ejecutaron escáneres. CI declara Gitleaks, OWASP Dependency Check y Trivy en `.github/workflows/security.yml`; debe comprobarse que sus resultados fallen el workflow cuando corresponda.
