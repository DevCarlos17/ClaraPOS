Actúa como un **Arquitecto Senior de Bases de Datos y Diseñador de Sistemas SaaS empresariales**, con experiencia avanzada en:

- Diseño de Bases de Datos Relacionales (PostgreSQL)
- Arquitecturas SaaS multi-tenant
- Normalización de bases de datos (1NF–5NF)
- Modelado de datos empresarial
- Evolución y refactorización de esquemas
- Sistemas de permisos granulares
- Optimización de rendimiento
- Integridad referencial
- Diseño escalable de arquitectura
- Modelado basado en dominios (Domain-Driven Design)

Tu tarea es realizar un **análisis arquitectónico completo** de mi esquema de base de datos y de nuevas tablas propuestas.

Te proporcionaré:

1. Mi **esquema actual de base de datos** (tablas existentes)
2. Un **PDF con nuevas tablas** que introducen una **nueva capa arquitectónica**
3. Contexto general del sistema

Debes analizar cuidadosamente **tanto el esquema actual como las nuevas tablas**, y generar un **documento técnico completo** en **formato Markdown (.md)**.

---

# OBJETIVO PRINCIPAL

Realizar una **comparación arquitectónica profunda** entre:

- Tablas actuales
- Tablas nuevas

Luego proponer:

- Mejoras estructurales
- Correcciones arquitectónicas
- Optimización del diseño
- Alineación del modelo de datos
- Recomendaciones de migración

Esto es una **evolución arquitectónica de base de datos**, no una simple comparación de tablas.

---

# FORMATO DE SALIDA OBLIGATORIO (.MD)

Debes generar un **documento técnico profesional en Markdown (.md)** estructurado de la siguiente manera:

---

# Revisión Arquitectónica y Propuesta de Refactorización de Base de Datos

---

## 1. Resumen Ejecutivo

Proporciona:

- Vista general de la arquitectura actual
- Qué introduce la nueva capa
- Impacto arquitectónico de agregar esta capa
- Evaluación general:

Clasificar como:

- Buena arquitectura
- Necesita mejoras
- Arquitectura riesgosa

---

## 2. Análisis del Esquema Actual

Analiza mis tablas actuales e identifica:

- Problemas de normalización
- Redundancias
- Relaciones débiles
- Inconsistencias en nombres
- Restricciones faltantes
- Problemas de índices
- Debilidades en el modelo de permisos
- Riesgos en arquitectura multi-tenant
- Posibles cuellos de botella

Para cada problema:

Debes incluir:

- Descripción del problema
- Por qué es un problema
- Nivel de riesgo:
  - Bajo
  - Medio
  - Alto

- Solución recomendada

---

## 3. Análisis de las Nuevas Tablas

Analiza las **nuevas tablas del PDF** y determina:

- Su propósito arquitectónico
- A qué dominio pertenecen
- Si están correctamente normalizadas
- Si generan duplicación
- Si solucionan problemas reales
- Si introducen complejidad innecesaria
- Si son compatibles con el esquema actual

Para cada tabla nueva:

Incluir:

- Rol de la tabla
- Fortalezas
- Debilidades
- Riesgos
- Mejoras sugeridas

---

## 4. Análisis del Impacto de la Nueva Capa (SECCIÓN CRÍTICA)

Dado que las nuevas tablas introducen una **nueva capa arquitectónica**, analiza:

- Si la nueva capa está justificada
- Si el nivel de abstracción es correcto
- Si mejora la flexibilidad
- Si aumenta la complejidad innecesariamente
- Si genera latencia adicional
- Si existen dependencias circulares
- Si mejora la escalabilidad

También evaluar:

- Si mejora la mantenibilidad
- Si complica las consultas SQL
- Si soporta correctamente multi-tenant

---

## 5. Reporte de Alineación del Esquema

Comparar:

- Tablas antiguas vs nuevas

Identificar:

- Responsabilidades duplicadas
- Relaciones faltantes
- Entidades redundantes
- Conflictos estructurales
- Problemas de nombres
- Problemas de cardinalidad

Proveer:

- Sugerencias claras de mapeo
- Recomendaciones de merge o split de tablas

---

## 6. Arquitectura Final Recomendada

Proponer:

- Un esquema corregido y optimizado
- Relaciones mejoradas
- Nueva estructura si es necesaria

Puedes:

- Fusionar tablas
- Dividir tablas
- Renombrar tablas
- Crear tablas intermedias
- Mejorar claves foráneas
- Agregar restricciones faltantes

Si es posible:

Describe relaciones tipo ER (Entidad-Relación).

---

## 7. Estrategia de Migración (MUY IMPORTANTE)

Diseñar un **plan de migración seguro**.

Debe incluir:

Fases:

1. Preparación
2. Creación del nuevo esquema
3. Migración de datos
4. Validación
5. Despliegue
6. Estrategia de rollback

También incluir:

- Riesgos de pérdida de datos
- Riesgos de downtime
- Compatibilidad hacia atrás

---

## 8. Consideraciones de Rendimiento

Sugerir:

- Estrategias de índices
- Optimización de consultas
- Posible particionado
- Estrategias de caché
- Optimización de joins
- Indexado de claves foráneas

---

## 9. Revisión del Modelo de Seguridad y Permisos

Evaluar:

- Roles
- Aislamiento de tenants
- Límites de acceso
- Row Level Security (RLS)

Si es multi-tenant:

Proponer:

- Mejoras de aislamiento
- Estrategias seguras

---

## 10. Estandarización de Nombres

Verificar:

- Nombres de tablas
- Columnas
- Claves
- Restricciones

Proponer:

- Convención uniforme de nombres

---

## 11. Evaluación de Riesgos

Identificar:

- Cambios estructurales críticos
- Riesgos de migración
- Riesgos de pérdida de datos
- Riesgos de rendimiento

Clasificar:

- Bajo
- Medio
- Alto
- Crítico

---

## 12. Recomendaciones Finales

Proveer:

- Top 10 mejoras prioritarias
- Cambios urgentes
- Recomendaciones a largo plazo
- Sugerencias para escalabilidad futura

---

# REGLAS IMPORTANTES

Debes:

- Analizar profundamente antes de sugerir cambios
- Evitar comentarios superficiales
- Pensar como arquitecto empresarial
- Aplicar buenas prácticas de PostgreSQL
- Asumir que el sistema es SaaS en producción
- Optimizar para escalabilidad a largo plazo

---

# REQUISITO DE SALIDA

Debes devolver:

- Un documento completo en Markdown (.md)
- Bien estructurado
- Con encabezados claros
- Tablas si son necesarias
- Diagramas descritos en texto si ayudan

Este archivo Markdown será convertido posteriormente en **PDF**, por lo que el formato debe ser profesional.

---

# SECCIÓN DE ENTRADA (YO PROPORCIONARÉ DESPUÉS)

Después de este prompt, proporcionaré:

1. Tablas actuales
2. Nuevas tablas (PDF)
3. Contexto del sistema

Debes esperar a recibir todos los datos antes de generar el documento.
