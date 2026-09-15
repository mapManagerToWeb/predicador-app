# CHANGES.md — Resumen de cambios (para revisión del PR)

**Fecha:** 2026-09-14
**Qué es esto:** lista de los cambios propuestos, en lenguaje simple, para revisar antes de aceptar el pull request. Están agrupados en 4 áreas: el reporte de WhatsApp, el rendimiento del mapa, la estabilidad general del sistema y la documentación/limpieza.

---

## 1) Reporte de WhatsApp (correcciones visibles)

**Antes:**

- Si un territorio estaba marcado como "zona parcial" (dibujado a medias), el envío del reporte podía fallar con un error.
- La imagen que se adjunta al reporte mostraba zonas parciales de territorios que **no** se habían trabajado en ese reporte (restos de reportes anteriores o de territorios ya completados), lo que generaba confusión.

**Ahora:**

- Un reporte con zona parcial se envía sin errores.
- La imagen del reporte muestra **solo los territorios que se trabajaron en ese reporte**. Si un territorio quedó parcial, se ve su parte parcial; los territorios no trabajados **no aparecen**.
- Después de tomar la captura, el mapa vuelve a su estado normal.

## 2) El mapa: más rápido y estable

- Se restauró la versión estable de la biblioteca de mapas (Leaflet 1.9.4) usada en producción, descartando la versión experimental con la que se estaba probando y que causaba problemas visuales.
- Al tocar una manzana, el mapa ya no revisa todas las manzanas una por una: ahora usa un "índice" que encuentra la manzana tocada al instante. La respuesta del mapa se siente más fluida.
- La geometría procesada de los territorios (contornos simplificados) se guarda durante la sesión: al volver a entrar al mapa no se recalcula todo desde cero, así se carga más rápido.
- Se corrigió un problema con territorios que tienen formas de varias partes (polígonos múltiples): antes podían romper la captura de la imagen del reporte o el guardado.

## 3) Estabilidad general del sistema (menos errores intermitentes)

- **Base de datos:** se amplió el grupo de conexiones y el tiempo de espera para absorber las ráfagas de uso cuando la base de datos "se despierta" tras estar dormida (modo ahorro de Neon). Antes, después de un periodo de inactividad, podían aparecer errores del servidor (500/503) al usar la app.
- **Puerta de entrada de peticiones (gateway):** ahora reintenta menos veces las peticiones fallidas y usa tiempos de espera más razonables para cada servicio, reduciendo errores cuando el sistema arranca en frío.
- **Mediciones de rendimiento web (RUM):** los datos incompletos (sin valor) ahora se rechazan en lugar de registrarse como cero, evitando estadísticas distorsionadas.

## 4) Documentación y limpieza

- Se actualizó el archivo de instrucciones del repositorio (AGENTS.md) para reflejar el estado real del proyecto.
- Se archivaron 5 propuestas de trabajo (OpenSpec) de este ciclo (además de una archivada previamente).
- Se robustecieron los flujos de CI (GitHub Actions): las acciones quedaron fijadas por SHA y se forzaron versiones de dependencias (Tomcat 11.0.25, Netty 4.2.17.Final, pgjdbc, BouncyCastle) para eliminar vulnerabilidades críticas detectadas por el escáner Trivy.
- Se dejó de usar la integración LSP de opencode (configuración local; sin efecto en la app).
- Se dejaron de controlar en git archivos de configuración del editor Eclipse (no deberían estar en el repositorio).
- Se ignoraron artefactos locales de planificación y depuración (carpetas `tasks/`, `.playwright-mcp/` y documentos `SPEC-map-*`, `CAPABILITY-MAP.md`) que solo sirven en la máquina de trabajo.

---

## Qué conviene verificar antes de aceptar

1. Enviar un reporte donde un territorio esté marcado como **zona parcial** → el reporte se envía correctamente y la imagen muestra solo ese territorio.
2. En un reporte **con varios territorios**, verificar que la imagen **no** muestre zonas parciales de territorios que no se trabajaron en ese reporte.
3. Navegar el mapa, marcar/desmarcar manzanas y dibujar zonas parciales → todo responde con fluidez.
4. Dejar la app inactiva un rato y volver a usarla → no deben aparecer errores 500/503.
5. Revisar que la app se vea y funcione normal en el móvil (la versión estable del mapa).

## Notas importantes

- **No se modificó la base de datos** (no hay migraciones) ni la estructura de datos de los reportes/territorios.
- **No se agregaron ni expusieron credenciales:** se verificó antes de commitear que no haya secretos en los cambios.
- **Nada se borró del proyecto:** los archivos siguen en disco; solo se organizó el historial de git.
- El PR contiene **16 commits**, cada uno con un cambio coherente y su propia descripción.

---

## Detalle técnico (opcional, para quien lo requiera)

| Área             | Cambio                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Reporte WhatsApp | Captura de imagen restringida a territorios editados + restauración del mapa después de capturar |
| Reporte WhatsApp | Los datos parciales se limpian después del guardado (evita estados inconsistentes)               |
| Mapa             | Revert a Leaflet 1.9.4 estable + renderizador estándar (sin repintado por frame)                 |
| Mapa             | Nuevo índice espacial para la selección de manzanas (de búsqueda lineal a búsqueda por celda)    |
| Mapa             | Cache en sesión de la geometría procesada (simplify/union) de territorios                        |
| Mapa             | Utilidad de aplanado de anillos (MultiPolygon) para captura, selección y cálculo de límites      |
| Backend          | Pool de conexiones 3→6 y timeout 15 s para el despertar de Neon (reporting y territory)          |
| Backend          | Gateway: retries 2→1 y timeouts explícitos por circuit breaker                                   |
| Backend          | RUM: valor de métrica obligatorio y finito                                                       |
| Repo             | AGENTS.md actualizado, OpenSpecs archivados, `.settings/` untrackeados, gitignore ampliado       |
| CI               | Workflows pineados por SHA; overrides de versiones (Tomcat/Netty/pgjdbc/BouncyCastle) para gate Trivy |
