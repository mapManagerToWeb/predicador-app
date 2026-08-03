# Hallazgos medios

| Hallazgo | Evidencia | Recomendación | Esfuerzo |
|---|---|---|---|
| Listados sin paginación | `ReportRepository.java:16-25`, `ReportController.java:43-64`, `EncargadoRepository.java:13-16` | Usar `Pageable`/`Page<T>` y límites de batch | M |
| HTTP externo sin timeouts | `RestClientConfig.java:10-13`, clientes WhatsApp | Configurar conexión/lectura y resiliencia | M |
| Fallos WhatsApp responden HTTP 200 | `ReportSendService.java:113-123`, `ReportController.java:67-70` | Mapear fallos a 4xx/5xx apropiados | S |
| Condición de carrera en buscar/crear | `EncargadoService.java:29-52`, migración `V1__add_indexes.sql` | Constraint único y manejo de colisión | M |
| PII en logs | `ReportSendService.java:49-50`, `WhatsAppMessageClient.java:52`, `WhatsAppMediaClient.java:55` | Enmascarar/eliminar teléfonos, nombres y payloads de INFO | S |
| `catch (Exception)` amplio | `WhatsAppMediaClient.java:57-60`, `ReportSendService.java:113-123`, `TerritoryService.java:196-231` | Capturar tipos concretos y loguear contexto sin PII | S |
| Respuestas externas con `Map` raw | `WhatsApp*Client.java`, `AuthController.java:54`, `EncargadoController.java:51` | DTOs/records tipados en límites estables | S |
| Captura frontend puede dejar `enviando=true` | `map-data-persistence.service.ts:86-97`, `map-capture.service.ts:19-35` | Unificar captura/envío bajo `try/finally` | S |
| Perfil JSON sin validar | `core/services/profile.ts:10-14` | Capturar JSON inválido y validar forma | S |
| TypeScript sin `strict: true` | `predicador-frontend/tsconfig.json:5-20` | Activar strictness progresivamente | M |
| `PreloadAllModules` precarga el mapa pesado | `src/app/app.config.ts:20-24` | Estrategia selectiva para mapa y html2canvas | S |
