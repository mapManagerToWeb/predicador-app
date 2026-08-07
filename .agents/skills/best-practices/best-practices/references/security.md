# Referencia de Seguridad

## Checklist de seguridad

### XSS / Inyección
- [ ] **Sin `bypassSecurityTrust*`**: nunca usar `bypassSecurityTrustHtml`, `bypassSecurityTrustUrl`, `bypassSecurityTrustScript`, etc.
- [ ] **Sin `innerHTML` sin sanitizar**: si es inevitable, usar `DomSanitizer.sanitize()`
- [ ] **Sanitizar URLs de usuario**: validar esquema (`https://`) y dominio permitido

### CSRF / XSRF
- [ ] **Interceptor CSRF activo**: `csrfInterceptor` en `app.config.ts` → `withInterceptors([...])`
- [ ] **Cookie `XSRF-TOKEN`**: backend debe setearla; frontend la lee y envía como header `X-XSRF-TOKEN`
- [ ] **Doble submit cookie pattern**: el interceptor implementa este patrón
- [ ] **Refresh automático en 403**: el interceptor reintenta el token CSRF si recibe 403

### Autenticación y sesión
- [ ] **Token en localStorage o cookie**: verificar mecanismo actual (`AuthTokenService`)
- [ ] **Validación de sesión en guard**: `profileGuard` valida sesión antes de acceder a `/map`
- [ ] **Logout limpia estado**: token, perfil, cachés invalidadas
- [ ] **Sesión expirada → redirect**: error interceptor maneja 401

### Cabeceras de seguridad (server.ts)
```typescript
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'SAMEORIGIN');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation()');
```

### Configuración de build
- [ ] **`allowedHosts` no vacío en producción**: `angular.json` → `security.allowedHosts`
- [ ] **HTTPS en producción**: redirigir HTTP → HTTPS
- [ ] **CSP headers**: configurar Content-Security-Policy según necesidades

### Dependencias
- [ ] **`npm audit` limpio**: revisar vulnerabilidades conocidas
- [ ] **Sin secretos en código**: API keys, tokens, passwords no hardcodeados
- [ ] **`.env` no commiteado**: variables de entorno en `.env.example` con valores dummy

## Vulnerabilidades OWASP Top 10 relevantes

| Riesgo | Mitigación en este proyecto |
|---|---|
| A01: Broken Access Control | Guards (`profileGuard`, `adminGuard`) + validación backend |
| A02: Cryptographic Failures | HTTPS + BCrypt en backend |
| A03: Injection | Sin `innerHTML` sin sanitizar; params de API tipados |
| A07: XSS | Angular sanitiza templates por defecto; sin `bypassSecurityTrust` |
| A07: CSRF | Double-submit cookie pattern en interceptor |
| A09: Security Logging | `RumService` envía métricas; errores globales capturados |

## Verificación rápida

```bash
# Buscar usos de bypassSecurityTrust
rg "bypassSecurityTrust" src/

# Buscar innerHTML sin sanitizar
rg "innerHTML" src/

# Buscar secrets hardcodeados
rg -i "(api[_-]?key|secret|password|token)\s*[:=]" src/ --glob '!*.spec.ts'
```
