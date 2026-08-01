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
- `errorInterceptor` debe limpiar sesión local y redirigir a `/login` solo en
  `401/403` de endpoints protegidos (no en los de login, para evitar loops).

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
