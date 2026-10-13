-- V9: día y turno de la predicación (ADR 0018).
--
-- `fecha` es cuándo se envió el reporte (hora del servidor) y sigue ordenando
-- los reportes: el estado de un territorio es su último reporte enviado. Pero
-- los hermanos a veces informan al día siguiente, así que al enviar eligen:
-- 1. fecha_predicacion: el día en que se predicó (lo que muestran el S-13, el
--    panel y el WhatsApp). NULL en reportes anteriores: se usa el día de `fecha`.
-- 2. turno: 'mañana' o 'tarde' (antes solo iba en el WhatsApp, no se guardaba).

ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS fecha_predicacion DATE;
ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS turno VARCHAR(10);
