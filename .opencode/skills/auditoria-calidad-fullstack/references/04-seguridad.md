# Seguridad (transversal: backend + frontend)

Marco de referencia: OWASP Top 10 (web) y OWASP API Security Top 10.
Úsalos como checklist conceptual; no inventes números de CVE concretos —
si sospechas una vulnerabilidad de una dependencia específica, recomienda
correr un escáner en vez de afirmarla de memoria.

## Autenticación y autorización

- Autorización a nivel de método (`@PreAuthorize`/`@PostAuthorize`) además
  de a nivel de endpoint — evita el caso típico de "cualquier usuario
  autenticado puede llamar a cualquier endpoint" cuando debería haber
  control por rol o por propietario del recurso.
- Si se usan JWT: verificar validación de `issuer`, `audience`,
  expiración, y que el algoritmo de firma esté fijado explícitamente
  (nunca aceptar `alg: none`).
- Contraseñas siempre con hash adaptativo (BCrypt/Argon2), nunca
  MD5/SHA1 ni texto plano.
- Revisar la decisión sobre CSRF: en una API stateless con JWT es
  razonable desactivarlo, pero debe ser una decisión explícita y
  documentada, no un default heredado sin revisar en un contexto con
  cookies de sesión.

## Validación de entrada e inyección

- Consultas parametrizadas siempre (JPQL/SQL nativo sin concatenación de
  strings con input de usuario).
- Bean Validation (`jakarta.validation`) en los DTOs de entrada, no
  validación manual dispersa.
- En Angular, revisar cualquier uso de `[innerHTML]`,
  `bypassSecurityTrustHtml`/`bypassSecurityTrustUrl` — Angular sanitiza por
  defecto; saltarse la sanitización manualmente es un punto de XSS que
  merece revisión caso por caso.
- Validar tipo, tamaño y contenido real (no solo la extensión) en
  cualquier endpoint de subida de archivos.

## Dependencias y cadena de suministro

- Backend: ejecutar un análisis de dependencias (p. ej. OWASP
  Dependency-Check, o el escáner disponible en el entorno) contra
  `pom.xml`/`build.gradle`.
- Frontend: ejecutar `npm audit` (o equivalente) contra el lockfile, y
  verificar que el lockfile esté commiteado y no desactualizado respecto
  al `package.json`.
- Reportar solo lo que el escáner realmente confirme; no extrapoles
  gravedad sin la evidencia del reporte.

## Gestión de secretos

- Buscar credenciales hardcodeadas en el repo (patrones tipo `password=`,
  `secret=`, claves de API, bloques `-----BEGIN PRIVATE KEY-----`) tanto
  en código como en archivos de configuración.
- Recomendar variables de entorno + un gestor de secretos (Vault, o el
  equivalente del proveedor cloud) en vez de valores en el repo, incluso
  en archivos "solo de ejemplo" si contienen valores reales.

## Transporte y cabeceras

- HTTPS forzado, HSTS habilitado.
- Cookies de sesión/autenticación con `HttpOnly`, `Secure` y `SameSite`
  apropiado.
- CORS con lista explícita de orígenes permitidos por entorno, nunca `*`
  combinado con credenciales.
- Cabeceras de seguridad a nivel de proxy/hosting: CSP,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`.

## Contenedores e infraestructura (si aplica)

- `Dockerfile` corriendo como usuario no-root.
- Imagen base mínima y con tag/digest fijado (evitar `latest`).
- Sin secretos horneados en capas de la imagen (revisar `ARG`/`ENV` con
  valores sensibles).

## Logging y auditoría

- Sin PII ni secretos en logs a nivel INFO/DEBUG.
- Logging estructurado; acciones sensibles (cambios de permisos, pagos,
  borrados) con registro de auditoría identificable (quién, cuándo, qué).
