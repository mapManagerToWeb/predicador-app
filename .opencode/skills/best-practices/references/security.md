# Seguridad — proyecto `predicador-frontend`

Verificar contra la doc oficial vigente: https://angular.dev/best-practices/security

## XSS
- Angular sanitiza por defecto: no usar `bypassSecurityTrust*` ni `innerHTML`
  con valores que puedan ser controlados por un atacante.
- Si se usan `bypassSecurityTrust*`, justificar y revisar el origen del valor;
  implican habilitar la policy `angular#unsafe-bypass` de Trusted Types.

## CSP y Trusted Types
- Configurar CSP a nivel de servidor (`src/server.ts` o infra/reverse proxy):
  `default-src 'self'; style-src 'self' 'nonce-...'; script-src 'self' 'nonce-...'`.
- Considerar Trusted Types:
  `Content-Security-Policy: trusted-types angular; require-trusted-types-for 'script';`
- Añadir cabeceras básicas: `X-Content-Type-Options: nosniff`,
  `frame-ancestors`/`X-Frame-Options`.

## CSRF / sesión
- Sesión HMAC en cookie **HttpOnly**; el frontend nunca guarda el token en
  localStorage (estado reactivo de rol sí, token no).
- `HttpClient` con `withCredentials: true` en requests al propio backend, y
  **nunca** en requests a terceros (tiles OSM, imágenes). Verificar que el
  interceptor filtra por URL relativa.
- Protección XSRF: interceptor propio o `withXsrfConfiguration`; los métodos
  mutantes deben llevar la cabecera del token leído de cookie.
- **Redundancia actual**: `provideHttpClient` ya activa el XSRF built-in
  (`XSRF-TOKEN` → `X-XSRF-TOKEN`), y además existe `csrfInterceptor` custom que
  repite el header y añade el seeding a `/api/v1/auth/csrf`. No es un bug
  (mismo valor, orden controlado), pero es lógica duplicada: documentar o
  delegar en `withXsrfConfiguration`/`withNoXsrfProtection` si cambia.
- `errorInterceptor` debe limpiar sesión local y redirigir a `/login` solo en
  `401/403` de endpoints protegidos (no en los de login, para evitar loops).

## Defensa en profundidad (routing)
- `admin.guard.ts` devuelve siempre `true` (decisión documentada: el form de
  admin vive en la propia ruta). La protección real es server-side (PUT
  `/territories/{n}/color` exige token admin). Si se quiere restringir el
  acceso a la ruta antes de renderizar el form, endurecer el guard.

## Hosts / SSRF
- `allowedHosts` explícito en `angular.json` (`security.allowedHosts`), nunca
  `"*"` (advisory GHSA-x288-3778-4hhx). En SSR, considerar
  `NG_ALLOWED_HOSTS`/`trustProxyHeaders` solo si hay reverse proxy confiable.

## Secretos
- `environment*.ts` es público en el bundle: no poner API keys ni secretos.
- El frontend llama por ruta relativa `/api/v1` (proxy). Verificar que no haya
  secretos hardcodeados (`rg -i "password|secret|api[_-]?key" src`).

## Chequeos por commit
- `npm audit` sin vulnerabilidades conocidas.
- `rg "bypassSecurityTrust|innerHTML" src` sin resultados no justificados.
- Docblocks que describan credenciales/cabeceras que el código ya no envía
  deben corregirse (comentario desactualizado = riesgo de confusión).
