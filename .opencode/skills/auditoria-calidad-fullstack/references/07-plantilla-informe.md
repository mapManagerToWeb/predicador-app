# Plantilla de informe final

Usa esta estructura para el resultado de la auditoría. Sustituye los
placeholders; elimina secciones sin hallazgos en vez de dejarlas vacías con
"N/A" repetido.

````markdown
# Auditoría de calidad — [nombre del proyecto]

## Resumen ejecutivo
[1 párrafo: tamaño aproximado del proyecto, stack detectado con versiones,
estado general de salud, y los 2-3 riesgos más importantes.]

## Stack detectado
| Componente | Versión encontrada | Estado (ver radar tecnológico) |
|---|---|---|
| Java | | |
| Spring Boot | | |
| Angular | | |
| Node.js | | |

## Hallazgos

### Crítico
**[Título del hallazgo]** — `ruta/archivo.ext:línea`
- Descripción:
- Impacto:
- Recomendación:
- Esfuerzo estimado: S/M/L

(repetir por hallazgo; agrupar ocurrencias idénticas con la lista de ubicaciones)

### Alto
[misma estructura]

### Medio
[misma estructura; puede resumirse en tabla si son muchos ítems similares]

### Bajo / mejoras de estilo
[lista breve, sin necesidad de detalle exhaustivo]

## Arquitectura y patrones de diseño
[Hallazgos estructurales: separación de capas, acoplamiento, anti-patrones
detectados, organización de paquetes/módulos.]

## Seguridad
[Resumen de hallazgos de seguridad, resultado de escáneres de dependencias
si se ejecutaron.]

## Cobertura y calidad de tests
[Estado de la pirámide de tests, huecos de cobertura en rutas críticas,
señales de tests de baja calidad.]

## Código muerto y deuda técnica
[Inventario resumido: clases/componentes sin uso, dependencias no usadas,
configuraciones duplicadas u obsoletas.]

## Dependencias y stack tecnológico
[Comparación contra el radar tecnológico: qué está al día, qué requiere
actualización y con qué prioridad.]

## Roadmap priorizado
| # | Acción | Impacto | Esfuerzo | Categoría |
|---|---|---|---|---|
| 1 | | | | |

(máximo 10 filas; ordenar por impacto/esfuerzo, quick wins primero)
````
