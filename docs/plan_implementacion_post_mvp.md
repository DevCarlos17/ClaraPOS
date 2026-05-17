# Plan de Implementación Post-MVP: Mejoras de Módulos ClaraPOS

> **Documento base:** `docs/revision_de_Modulos__Mejoras_Post_MVP.md`
> **Fecha de análisis:** 2026-05-10
> **Estado del codebase:** Todos los módulos descritos ya existen en el código. Se identificó importación masiva ya implementada para Productos (`import-productos-modal.tsx`, `productos-export.ts`) y Plan de Cuentas (`plan-cuentas-import.tsx`). El módulo de Depósitos también existe. Se detectó `use-supervisor-pin.ts` y `use-unidades-conversion.ts` ya presentes.

---

## Criterios de Priorización

| Dimensión | Criterio |
|-----------|----------|
| **Seguridad** | Vulnerabilidades de inputs (XSS, inyección) van primero, son transversales |
| **Impacto** | Módulos de mayor frecuencia de uso: Productos > Clientes > Compras > Configuración |
| **Dependencia** | Sanitización (Fase 0) desbloquea todas las demás fases |
| **Complejidad** | Quick wins (UI/UX) antes que nuevas features de lógica de negocio |
| **Riesgo** | Cambios en módulos con datos financieros (Impuestos, Bancos) con mayor cuidado |

## Leyenda de Prioridad y Esfuerzo

| Símbolo | Prioridad | | Símbolo | Esfuerzo estimado |
|---------|-----------|--|---------|-------------------|
| 🔴 | Crítico (P0) — Seguridad o dato corrupto | | **S** | Pequeño (horas) |
| 🟠 | Alto (P1) — Afecta flujo principal del usuario | | **M** | Mediano (1-3 días) |
| 🟡 | Medio (P2) — Mejora UX importante | | **L** | Grande (3-7 días) |
| 🟢 | Bajo (P3) — Nice-to-have / Largo plazo | | **XL** | Muy grande (1-2+ semanas) |

---

## Fase 0 — Hardening Transversal de Inputs
> **Justificación:** Es el cimiento que habilita la seguridad de todas las fases siguientes. No iniciar ninguna otra fase hasta completar al menos los ítems P0 y P1 aquí.

### 0.1 Protección de Inputs Numéricos (Quick Win masivo)
Aplica a: **todos los módulos** que tienen inputs de tipo `number`.

| # | Tarea | Prioridad | Esfuerzo | Archivos afectados (ejemplos) |
|---|-------|-----------|----------|-------------------------------|
| 0.1.1 | Eliminar flechas de incremento/decremento (`spinners`) de todos los inputs numéricos usando CSS global (`input[type=number]::-webkit-outer-spin-button { display: none }`) | 🟠 | S | `src/index.css` |
| 0.1.2 | Bloquear modificación de valores mediante scroll del mouse en inputs numéricos con handler `onWheel={(e) => e.currentTarget.blur()}` aplicado como utilidad reutilizable | 🟠 | S | Crear util `src/lib/input-utils.ts` |
| 0.1.3 | Validar que los módulos de Compras (tasa interna, tasa proveedor, costo, monto abonos), Impuestos (alícuota), Precios (márgenes), Clientes (límite crédito) y Proveedores (crédito) apliquen lo anterior | 🟠 | M | Múltiples feature forms |

### 0.2 Sanitización de Texto en 3 Capas
El "Protocolo Escudo Clara" definido en el documento de revisión.

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 0.2.1 | **Capa 1 - Frontend:** Crear hook `useTextSanitizer` que aplique `.toUpperCase()`, limite caracteres especiales (`/?.\\*-+,;'"<>`) y aplique `trim()` en `onBlur`. Debe ser reutilizable en cualquier `<Input>` | 🔴 | M | `src/lib/sanitizer.ts` |
| 0.2.2 | **Capa 1 - Frontend:** Crear componente `<SanitizedInput>` que wrappee el shadcn `<Input>` con las restricciones configurables: `allowedPattern`, `maxLength`, `uppercase`. Usarlo como reemplazo en formularios críticos | 🟠 | M | `src/components/ui/sanitized-input.tsx` |
| 0.2.3 | **Capa 1 - Frontend:** Deshabilitar botón "Guardar" automáticamente si el valor tiene caracteres prohibidos o excede `maxLength` | 🟠 | S | Via Zod schema + form state |
| 0.2.4 | **Capa 2 - Zod Schemas:** Refinar schemas existentes (`departamento-schema`, `unidad-schema`, `deposito-schema`, `cliente-schema`, `proveedor-schema`, `banco-schema`) para rechazar caracteres especiales con regex: `/^[A-ZÁÉÍÓÚÜÑ0-9\s]+$/` | 🔴 | M | `src/features/*/schemas/*.ts` |
| 0.2.5 | **Capa 3 - DB:** Documentar los CHECK constraints de Supabase/Postgres que deben aplicarse a nivel de tabla para los campos de nombre (departamento, depósito, unidad, cliente, etc.) | 🟡 | S | `backend/` — SQL migrations |

### 0.3 Validación de Archivos de Importación

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 0.3.1 | Crear función `validateImportFile(file)` que valide MIME type (`text/csv` o `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) y tamaño máximo (5MB). Lanzar toast de error si falla | 🔴 | S | `src/lib/import-utils.ts` |
| 0.3.2 | Aplicar esta función en `import-productos-modal.tsx` y en cualquier otro modal de importación que se cree en fases posteriores | 🔴 | S | Reutilizar en cada modal |
| 0.3.3 | Implementar límite de 500 registros por lote en todos los modales de importación. Si el archivo supera el límite, mostrar error antes de procesar | 🔴 | S | Integrar en parse logic |

### 0.4 Protocolo de Inserción Masiva (Bulk Insert)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 0.4.1 | Documentar y aplicar la regla: toda importación debe hacer un único `bulkInsert` (JSON Array) hacia Supabase en lugar de bucles con inserciones individuales. Crear función helper `bulkInsert<T>(table, rows, empresaId)` | 🟠 | M | `src/lib/import-utils.ts` |
| 0.4.2 | Revisar la implementación actual de `import-productos-modal.tsx` para verificar que ya sigue este patrón. Corregir si usa `forEach` con inserciones individuales | 🟠 | M | `src/features/inventario/components/productos/import-productos-modal.tsx` |

---

## Fase 1 — Inventario: Departamentos
> **Estado actual:** Existe `departamento-form.tsx`, `departamento-schema.ts`, `use-departamentos.ts`. No hay importación masiva ni sorting avanzado.

### 1.1 Importación Masiva

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 1.1.1 | Crear `import-departamentos-modal.tsx` con soporte para `.xlsx` y `.csv`. Solo requiere la columna `nombre_departamento` | 🟠 | L | Basarse en `import-productos-modal.tsx` como referencia |
| 1.1.2 | Lógica de código correlativo automático: calcular el próximo `codigo` sumando 1 al máximo existente para la `empresa_id`. Nuevos registros siguen la secuencia sin gaps | 🟠 | S | En la lógica de parse/transform |
| 1.1.3 | Estado por defecto `is_active: true` para todos los registros importados | 🟠 | S | En la lógica de transform |
| 1.1.4 | Previsualización obligatoria (modal/tabla temporal) antes de confirmar la inserción en BD | 🟡 | M | Patron: paso 1 = parse/preview, paso 2 = confirmar |
| 1.1.5 | Aplicar el `bulkInsert` helper de Fase 0 para la inserción | 🟠 | S | Reutilizar helper |

### 1.2 Detección de Duplicados

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 1.2.1 | Al crear o importar, verificar coincidencia exacta (case-insensitive) contra los nombres existentes | 🟡 | S | Query en `use-departamentos` |
| 1.2.2 | **Extra:** Detección por similitud básica (normalizar texto eliminando plurales comunes: quitar 'S' final) para advertir sobre posibles duplicados como "REFRESCO" vs "REFRESCOS". Mostrar warning, no bloquear | 🟢 | L | Solo advertencia, no bloqueo |

### 1.3 Audit Log

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 1.3.1 | Incluir `created_by` y `updated_by` (UUID del usuario de sesión) en la tabla `departamentos` de Supabase. Migración SQL necesaria | 🟡 | M | `backend/` — SQL migration |
| 1.3.2 | Actualizar `use-departamentos.ts` para incluir `created_by: user.id` al insertar y `updated_by: user.id` al actualizar | 🟡 | S | `src/features/inventario/hooks/use-departamentos.ts` |

### 1.4 Mejoras de Tabla

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 1.4.1 | Activar sorting por columna en la tabla de departamentos (Nombre, Código, Estado). El componente `data-table` ya tiene `column-header.tsx` — revisar si está activado | 🟡 | S | `src/routes/_app/inventario/departamentos.tsx` |
| 1.4.2 | Persistir el estado de ordenamiento en `localStorage` con clave `clarapos:departamentos:sort` para que el usuario mantenga su preferencia entre navegaciones | 🟢 | S | Zustand persist o `localStorage` directo |
| 1.4.3 | Aplicar sanitización de la Fase 0 al formulario de creación manual (`departamento-form.tsx`) | 🔴 | S | `src/features/inventario/components/departamentos/departamento-form.tsx` |

---

## Fase 2 — Inventario: Depósitos
> **Estado actual:** Existe `deposito-form.tsx`, `deposito-schema.ts`, `use-depositos.ts`, ruta `_app/inventario/depositos.tsx`. No hay importación masiva ni sorting avanzado confirmado.

### 2.1 Importación Masiva

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 2.1.1 | Crear `import-depositos-modal.tsx`. Columnas: `nombre_deposito` (obligatorio), `direccion` (opcional), `es_principal` (SI/NO o 1/0), `permite_venta` (SI/NO o 1/0) | 🟡 | L | Mismo patrón que importación de departamentos |
| 2.1.2 | Lógica de unicidad de `es_principal`: si varios vienen marcados como Principal en el Excel, solo el primero se acepta, el resto se marcan `false`. Si ninguno viene, mantener el existente | 🟠 | M | En la lógica de transform antes del bulk insert |
| 2.1.3 | Previsualización obligatoria antes de confirmar | 🟡 | M | Mismo patrón de 2 pasos |

### 2.2 Mejoras de Tabla

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 2.2.1 | Activar sorting por columna (Nombre, Dirección, Permite Venta, Es Principal) con indicador visual de flecha | 🟡 | S | `src/routes/_app/inventario/depositos.tsx` |
| 2.2.2 | Opción "Sticky Row" para el Depósito Principal (fijarlo en primera fila independientemente del sort). Implementar como checkbox en configuración de tabla | 🟢 | M | Feature de UX avanzada |
| 2.2.3 | Persistir preferencia de sort en `localStorage` | 🟢 | S | Mismo patrón que Fase 1 |
| 2.2.4 | Aplicar sanitización Fase 0 a `deposito-form.tsx` | 🔴 | S | `src/features/inventario/components/depositos/deposito-form.tsx` |

### 2.3 Feature Post-MVP: Traspaso Express

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 2.3.1 | Botón "Traspaso Express" que genere movimiento de inventario entre depósitos con generación de PDF/planilla de registro. Requiere flujo complejo de kardex doble (salida de origen, entrada en destino) | 🟢 | XL | Evaluar en sprint separado |

---

## Fase 3 — Inventario: Unidades
> **Estado actual:** Existe `unidad-form.tsx`, `unidad-schema.ts`, `use-unidades.ts`, `use-unidades-conversion.ts` (¡conversión ya existe!). Ruta `_app/inventario/unidades.tsx`.

### 3.1 Auto-carga en Onboarding

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 3.1.1 | Al registrar una nueva empresa (Edge Function `register-owner`), insertar automáticamente el set mínimo de unidades: `UNIDAD (UND, no fraccionable)` y `KILOGRAMO (KG, fraccionable)` | 🟠 | M | Modificar `backend/supabase/functions/register-owner` |
| 3.1.2 | Mover el botón "Cargar Predeterminadas" a una sección de "Configuración Avanzada" o "Recuperar datos" si existe, para que no confunda al usuario ya configurado | 🟡 | S | UI change en `_app/inventario/unidades.tsx` |

### 3.2 Importación Masiva

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 3.2.1 | Crear `import-unidades-modal.tsx`. Columnas: `nombre_unidad`, `abreviatura` (máx 5 chars), `permite_decimales` (boolean) | 🟡 | L | Mismo patrón de importación |
| 3.2.2 | Validar que la `abreviatura` tenga entre 1 y 5 caracteres. Marcar como error las filas que la violen | 🟡 | S | En la lógica de validate |
| 3.2.3 | Previsualización obligatoria antes de confirmar | 🟡 | M | — |

### 3.3 Protección de Unidades en Uso

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 3.3.1 | Al intentar eliminar una unidad, verificar si tiene productos o movimientos de inventario asociados. Si los tiene, bloquear el delete y mostrar mensaje: "Esta unidad tiene X productos asociados. Solo puede desactivarla" | 🔴 | M | Verificación en `use-unidades.ts` antes de delete |
| 3.3.2 | Ofrecer la opción "Desactivar" en lugar de eliminar cuando existen dependencias | 🟠 | S | Toggle `is_active` en la unidad |

### 3.4 Factores de Conversión (use-unidades-conversion.ts ya existe)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 3.4.1 | Revisar el estado actual de `use-unidades-conversion.ts` y `conversion-schema.ts`. Si la conversión (1 CAJA = 12 UND) ya está implementada, documentar y verificar que funcione en el flujo de compras | 🟡 | M | Audit del código existente |
| 3.4.2 | Si no está conectado al flujo de compras: al cargar una compra en CAJAS, el inventario debe subir en UNIDADES según el factor de conversión definido | 🟡 | L | Lógica en `use-compras.ts` |

### 3.5 Mejoras de Tabla

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 3.5.1 | Activar sorting por Nombre, Abreviatura y Permite Decimales | 🟡 | S | `src/routes/_app/inventario/unidades.tsx` |
| 3.5.2 | Agregar filtro inline de búsqueda sobre la tabla (input que filtra al escribir) | 🟡 | S | Usar el `<Input>` de búsqueda del DataTable toolbar |
| 3.5.3 | Aplicar sanitización Fase 0 a `unidad-form.tsx` | 🔴 | S | `src/features/inventario/components/unidades/unidad-form.tsx` |

---

## Fase 4 — Inventario: Productos (Mejoras al Import Existente)
> **Estado actual:** `import-productos-modal.tsx` y `productos-export.ts` YA EXISTEN. Esta fase mejora y extiende lo que hay.

### 4.1 Mejoras Críticas al Modal de Importación

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 4.1.1 | **Exclusión de filas de ejemplo:** La plantilla tiene registros de ejemplo. Si `nombre` o `codigo` coincide con los ejemplos del template (ej: "PRODUCTO EJEMPLO", "EJ001"), marcarlos en rojo en la previsualización y advertir que no se importarán. No bloquear el resto | 🟠 | M | Definir lista de strings "de ejemplo" en constante |
| 4.1.2 | **Campo `stock_minimo` en previsualización:** Agregar la columna `stock_minimo` a la tabla de previsualización del modal para que el usuario la revise antes de confirmar | 🟡 | S | En el componente de preview table |
| 4.1.3 | **Validación de barcode único:** Si el Excel trae dos productos con el mismo código de barras o SKU, marcarlos como error. Si ya existe en BD, resaltarlos como conflicto con opción de actualizar o saltar | 🟠 | M | Cross-check contra BD durante el parse |
| 4.1.4 | **Log de errores exportable:** Agregar botón "Exportar log de errores" (formato TXT o clipboard) que genere un listado legible de todas las filas con problema y su razón. Útil para asistencia remota | 🟡 | M | Función `generateErrorLog(rows)` que retorne string formateado |

### 4.2 Interfaz de Mapeo de Departamento

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 4.2.1 | Si un departamento del Excel no existe en BD (búsqueda case-insensitive), mostrar pantalla intermedia de resolución: "El departamento 'BEBIDAS' no existe. ¿Mapearlo a uno existente o crearlo como nuevo?" | 🟠 | L | Paso adicional en el flujo de importación (entre parse y confirm) |
| 4.2.2 | Si el usuario elige "Saltar", la fila se marca como `status: 'error'` y no se importa. El resto sí. Al final se muestra el conteo de importados vs saltados | 🟡 | M | Integrado en la lógica de 4.2.1 |

### 4.3 Mejoras de Performance

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 4.3.1 | Verificar y reforzar que el import usa bulk insert (no `forEach` con inserts individuales). Si lo viola, corregir | 🟠 | M | Audit de `import-productos-modal.tsx` |
| 4.3.2 | Si el archivo tiene más de 500 registros, bloquear y mostrar error claro con instrucción de dividir en lotes | 🔴 | S | Aplicar función de Fase 0.3.3 |

### 4.4 Sorting y Lógica de Tabla de Productos

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 4.4.1 | Asegurar que `codigo_interno` se ordene numéricamente (no alfabéticamente). Usar `orderBy: sql\`CAST(codigo_interno AS INTEGER)\`` | 🟠 | S | En el hook `use-productos` o query PowerSync |
| 4.4.2 | Productos sin código manual asignado van al final de la lista (nulls last) | 🟡 | S | `ORDER BY codigo_interno NULLS LAST` |
| 4.4.3 | Activar debounce de 300ms en el sorting de columnas para no saturar el render si el usuario hace clic frenéticamente | 🟢 | S | `useDebounce` hook |

### 4.5 Manejo de IVA por Defecto en Importación

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 4.5.1 | Si el Excel no incluye columna `impuesto` o viene vacía, asignar automáticamente el impuesto marcado como `is_default: true` de la empresa. Mostrar aviso en previsualización | 🟡 | M | Consultar impuesto por defecto al parsear |

---

## Fase 5 — Configuración: Empresa y Parámetros Fiscales
> **Estado actual:** `company-data-form.tsx`, `company-schema.ts`, `use-company.ts`, `use-empresa-fiscal.ts` existen.

### 5.1 Sincronización con Wizard

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 5.1.1 | Los datos capturados en el Wizard de Instalación deben persistir en `CL_CompanyProfile` (o `empresas`). Al entrar a Configuración, los campos deben estar pre-cargados con lo ingresado en el onboarding | 🟠 | M | Verificar flujo de `register-owner` Edge Function |
| 5.1.2 | El usuario solo debe editar en Configuración para corregir (logo, dirección fiscal exacta), no para reescribir datos ya capturados | 🟡 | S | Validación UX — si ya existe data, pre-llenar |

### 5.2 Campos Fiscales y Validaciones

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 5.2.1 | **Máscara de RIF:** Validar formato venezolano (J-12345678-9, V-12345678-9, G-, E-) con regex. Mostrar tooltip: "Ejemplo: J-12345678-0. Asegúrate de incluir el guion final" | 🟠 | M | En `company-schema.ts` + UI feedback |
| 5.2.2 | **Campo "Tipo de Contribuyente":** Selector con opciones: Ordinario, Especial, Formal, Exento. Afecta si se calcula IGTF (3%) automáticamente | 🟠 | M | Agregar campo a schema y form |
| 5.2.3 | **Contribuyente Especial:** El campo "% Retención IVA" solo se muestra si el checkbox Contribuyente Especial está activo. El input debe ser `type="number"` sin flechas ni scroll | 🟡 | M | Lógica condicional en `company-data-form.tsx` |
| 5.2.4 | **Campo correo del contador:** Para envíos automáticos de reportes | 🟢 | S | Campo adicional en company form |

### 5.3 Secuencias Fiscales (Talonarios)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 5.3.1 | Crear tabla de configuración de "Rangos Autorizados" con campos: Serie, Número de Control Inicial, Número de Factura Inicial, Próximo Número (auto-incrementa) | 🟠 | L | Nueva tabla en BD + UI |
| 5.3.2 | **Modo Entrenamiento vs Producción:** Por defecto, al instalar, los números de factura no afectan el contador legal. Botón prominente "Activar Facturación Legal" que al presionarse solicita los datos del talonario y hace los contadores inmutables | 🟠 | L | Flag `modo_produccion: boolean` en `empresas` |
| 5.3.3 | **Alerta de Talonario por Vencer:** Notificación automática cuando quedan menos de 50 facturas disponibles en el rango | 🟡 | M | Lógica de alerta en dashboard o al iniciar sesión |
| 5.3.4 | Notas de Débito y Crédito deben tener su propia secuencia independiente | 🟠 | M | Ranges separados en la tabla |
| 5.3.5 | Anulación como única opción de "eliminación" de facturas: el registro permanece con `estado: 'anulado'`, nunca se borra | 🔴 | M | Ya debe estar implementado — verificar y asegurar |

### 5.4 Tooltips e Interfaz

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 5.4.1 | Agregar tooltips en campos críticos: RIF, Contribuyente Especial, Moneda Base, % Retención IVA | 🟡 | S | Usando componente `<Tooltip>` de shadcn/ui ya instalado |
| 5.4.2 | Logo para documentos fiscales: uploader de imagen que optimice a escala de grises para impresión térmica | 🟢 | L | Supabase Storage + processing |

---

## Fase 6 — Configuración: Tasa de Cambio
> **Estado actual:** `tasa-cambio.tsx` y `use-tasas.ts` existen.

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 6.1 | **No ejecutar consulta automática al entrar a la sección.** La lista de tasas recientes debe cargarse solo al presionar un botón "Consultar últimas 10 tasas" | 🟠 | S | Cambiar el comportamiento de carga inicial en `tasa-cambio.tsx` |
| 6.2 | Agregar filtro opcional por intervalo de fechas (con límite máximo de 3 meses hacia atrás) para consultar el historial. Evitar queries sin restricción de fechas | 🟡 | M | UI + validación en `use-tasas.ts` |
| 6.3 | Eliminar flechas de incremento y la posibilidad de modificar el monto con scroll del mouse en el input de tasa | 🟠 | S | Aplicar util de Fase 0.1 |
| 6.4 | Integrar la sección de Tasa de Cambio como una pestaña adicional dentro de "Configuración de Empresa" para consolidar el panel | 🟢 | M | Reorganización de routing/UI |

---

## Fase 7 — Configuración: Impuestos
> **Estado actual:** `use-impuestos.ts`, `impuesto-schema.ts`, ruta `_app/configuracion/impuestos.tsx` existen.

### 7.1 Pre-carga de Impuestos Venezolanos

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 7.1.1 | Al crear un nuevo tenant, insertar automáticamente: IVA General 16% (default), IVA Reducido 8% (inactivo), IVA Lujo 31% (inactivo), IGTF 3% (solo aplica a divisas), Exento 0% | 🟠 | M | Modificar Edge Function `register-owner` |
| 7.1.2 | Marcar IVA 16% como `is_default: true`. Usar este valor en la importación de productos (Fase 4.5) | 🟠 | S | Lógica en seeding del tenant |

### 7.2 Protección de Impuestos con Historial

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 7.2.1 | Si un impuesto ya fue utilizado en alguna factura, bloquear el DELETE. Mostrar botón "Desactivar" como única opción. Esto asegura que las facturas históricas puedan reimprimirse con el impuesto correcto | 🔴 | M | Verificar en `use-impuestos.ts` antes de delete |
| 7.2.2 | El campo `is_active: false` oculta el impuesto de los selectores de nueva factura, pero lo mantiene en BD para historial | 🟠 | S | Ya debería existir — verificar |

### 7.3 Mejoras al Modal de Creación

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 7.3.1 | Aplicar `.toUpperCase()` automático al campo `nombre_impuesto`. Solo alfanuméricos y espacios | 🟠 | S | En `impuesto-schema.ts` |
| 7.3.2 | Campo de alícuota: eliminar spinners, bloquear scroll, limitar rango a 0-100 | 🟠 | S | Aplicar util de Fase 0.1 |
| 7.3.3 | Ocultar "Código SENIAT" bajo botón "Opciones Avanzadas". Si el sistema no genera TXT para máquinas fiscales, marcarlo como `(Opcional)` | 🟡 | S | UI change |
| 7.3.4 | Agregar tooltip: "Ingresa el valor porcentual sin el símbolo %. Ejemplo: Para 16% ingresa 16" | 🟡 | S | Componente `<Tooltip>` |
| 7.3.5 | Nota informativa sobre IGTF: "El IGTF solo se activa si el método de pago es en divisas, no aplica a todos los clientes" | 🟢 | S | Text/info box en UI |

---

## Fase 8 — Configuración: Precios y Listas
> **Estado actual:** No se identificó un módulo explícito de "Precios" en el codebase. Puede existir como parte del form de productos (`precio-display.tsx`) o en configuración de empresa. Requiere auditoría primero.

### 8.1 Auditoría Previa (antes de implementar)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 8.1.1 | Identificar si existe una pantalla de configuración de listas de precios (Detal, Mayorista, VIP) en el codebase actual. Buscar en `configuracion/` y en `productos/` | 🟠 | S | Audit — no implementar hasta confirmar |

### 8.2 Configuración de Niveles de Precio

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 8.2.1 | Crear pantalla/pestaña "Listas de Precios" en Configuración: tabla de niveles con campos: Nombre personalizado (ej. "Detal"), Margen % por defecto | 🟡 | L | Nueva feature si no existe |
| 8.2.2 | En el Wizard de onboarding, paso de "Estrategia de Precios": solicitar nombres y márgenes por defecto | 🟡 | L | Modificar Wizard |
| 8.2.3 | Al crear un producto, pre-calcular los precios de venta de cada nivel basándose en el costo y los márgenes configurados | 🟡 | M | Lógica en `producto-form` |
| 8.2.4 | Inputs de margen y precio: eliminar spinners y scroll. Advertencia si margen resulta en precio < costo | 🟠 | S | Aplicar utils de Fase 0.1 + validación Zod |
| 8.2.5 | Nombres de niveles pasan por `.toUpperCase()` y solo alfanuméricos | 🟡 | S | Schema Zod |
| 8.2.6 | Sincronización en tiempo real: si el usuario cambia el margen, los precios de los otros niveles se recalculan instantáneamente sin recargar la página | 🟡 | M | `useEffect` o `watch` de TanStack Form |

---

## Fase 9 — Bancos y Métodos de Pago
> **Estado actual:** `use-bancos.ts`, `banco-schema.ts`, ruta `_app/configuracion/bancos.tsx` existen. `use-payment-methods.ts` y `payment-method-schema.ts` también.

### 9.1 Mejoras al Módulo de Bancos

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 9.1.1 | **Vista Master-Detail:** Al hacer clic en un banco, desplegar panel lateral o sección inferior con: info general, métodos de pago asociados, cuenta contable vinculada. Sin navegar a nueva pantalla | 🟡 | L | Refactor de UI en `_app/configuracion/bancos.tsx` |
| 9.1.2 | **Filtro de cuentas contables:** Al vincular un banco a una cuenta, el selector solo debe mostrar cuentas de tipo "Bancos/Disponibilidad". Si el banco es en USD, solo cuentas en moneda extranjera | 🟠 | M | Filtro en `use-plan-cuentas.ts` |
| 9.1.3 | **Detección de cuenta duplicada:** Impedir dos bancos con el mismo número de cuenta para el mismo `empresa_id` | 🔴 | S | Validación en `use-bancos.ts` antes de insert |
| 9.1.4 | Importación masiva con previsualización (máx 500 registros, sanitización, límite de caracteres) | 🟢 | L | Nuevo modal de importación |

### 9.2 Métodos de Pago Avanzados

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 9.2.1 | **Categorización de métodos:** Agregar campo `tipo` al método de pago con opciones: MONETARIO (Efectivo, Banco, Zelle), COMPENSACIÓN (Permuta, Notas de Crédito), INTERNO (Consumo, Cortesía) | 🟡 | M | Migración de BD + update de schema y hooks |
| 9.2.2 | **Permuta / Cruce de Cuentas:** Crear método de pago tipo "Cruce de Cuentas". Al seleccionarlo en POS, pedir referencia del documento que compensa (factura o nota de crédito) | 🟢 | XL | Feature de alta complejidad contable |
| 9.2.3 | **Consumo Interno:** Método que rebaja stock al precio de costo (no de venta) y afecta cuenta de "Gasto por Consumo Interno" en lugar de "Ventas" | 🟢 | XL | Feature de alta complejidad contable |
| 9.2.4 | **Restricción de acceso:** Métodos tipo INTERNO y COMPENSACIÓN requieren PIN de Supervisor para ser seleccionados en POS | 🟠 | M | Integrar con `use-supervisor-pin.ts` ya existente |
| 9.2.5 | **Comisión bancaria por defecto:** Campo `% comision` en configuración del banco. Al registrar pago, calcular automáticamente el gasto bancario | 🟢 | M | Feature de conveniencia |

---

## Fase 10 — Usuarios, Roles y Seguridad
> **Estado actual:** `use-usuarios.ts`, `usuario-schema.ts`, `use-roles.ts`, `use-supervisor-pin.ts` (¡YA EXISTE!), `usuario-form-page.tsx`, `permisos-display.tsx`, `role-card-selector.tsx`. Rutas bajo `_app/configuracion/usuarios/`.

### 10.1 Rediseño UI: Separación Roles vs Usuarios

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 10.1.1 | Separar la pantalla de usuarios en 2 pestañas claras: **"Gestión de Roles"** (crear/editar plantillas de permisos) y **"Asignación de Usuarios"** (listar trabajadores, asignarles un rol via dropdown) | 🟠 | L | Refactor de `_app/configuracion/usuarios/` |
| 10.1.2 | Diferenciar visualmente (color, posición) los botones "Crear Nuevo Rol" y "Registrar Nuevo Trabajador" para que el usuario entienda que son entidades distintas | 🟡 | S | UI/styling change |

### 10.2 PIN de Seguridad (use-supervisor-pin.ts ya existe)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 10.2.1 | Verificar el estado y alcance del `use-supervisor-pin.ts` existente. Auditar si el PIN está siendo solicitado en todas las "Acciones Sensibles": eliminar ítem de factura activa, aplicar descuento > 10%, anular factura | 🔴 | M | Audit + posibles ajustes en módulo de ventas |
| 10.2.2 | Asegurar que el PIN se almacena con hash (bcrypt) en BD. Si no, migrar. No almacenar en texto plano | 🔴 | M | Verificar en Edge Function o Supabase |
| 10.2.3 | "Login Rápido": el cajero puede cambiar de turno o bloquear pantalla sin cerrar sesión, usando su PIN | 🟡 | L | Nuevo flujo de UI |

### 10.3 Matriz de Permisos Granular

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 10.3.1 | Revisar si `permisos-display.tsx` y `role-card-selector.tsx` ya implementan permisos granulares. Verificar que existan al menos: Ver Costos, Modificar Precios de Venta, Aplicar Descuentos, Ver Reportes de Utilidad | 🟠 | M | Audit del código existente |
| 10.3.2 | Si los permisos no son granulares, implementar la matriz: array de permisos booleanos por rol. El componente `require-permission.tsx` ya existe y puede extenderse | 🟠 | L | `src/components/shared/require-permission.tsx` |

### 10.4 Bitácora y Sesiones

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 10.4.1 | **Bitácora de acciones por PIN:** Cuando se usa el PIN de supervisor, guardar log: "Supervisor [Nombre] autorizó [Acción] en [Contexto] a las [Hora]" | 🟡 | M | Nueva tabla `logs_supervisor` o extender tabla de auditoría |
| 10.4.2 | **Control de sesiones concurrentes:** Configurar si un usuario puede estar logueado en dos dispositivos simultáneamente. Para cajeros, la opción debería ser NO | 🟢 | L | Requiere manejo de sesiones en Supabase Auth |
| 10.4.3 | Mini-tutorial dinámico con "Tooltips de primera vez" al entrar al módulo de usuarios por primera vez | 🟢 | M | State de "primera vez" en localStorage |

---

## Fase 11 — Clientes y CRM
> **Estado actual:** `cliente-form.tsx`, `cliente-schema.ts`, `use-clientes.ts`. Rutas `_app/clientes/`.

### 11.1 Performance y Carga Inicial

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.1.1 | **Lazy Loading:** No cargar todos los clientes al entrar. Mostrar Top 20 por frecuencia de facturación o volumen de ventas | 🟠 | M | Cambiar query en `use-clientes.ts` para limitar a 20 + ordenar |
| 11.1.2 | Búsqueda dinámica: resultados en tiempo real al filtrar por RIF, Cédula o Nombre. Mínimo 2 caracteres para activar búsqueda | 🟠 | M | Debounce en input de búsqueda + query reactiva |

### 11.2 Rediseño Vista de Detalle

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.2.1 | Al seleccionar un cliente, abrir Vista de Detalle (Full Page o Modal Expandido) con secciones jerárquicas: Datos Fiscales, Perfil Comercial (nivel de precio, límite/días de crédito), Historial Rápido (últimas 5 facturas, saldo) | 🟡 | L | Nuevo componente `cliente-detail-view.tsx` |
| 11.2.2 | Eliminar el ajuste dinámico de tamaño de tabla que puede ser visualmente molesto | 🟡 | S | CSS/layout change |

### 11.3 Validaciones y Sanitización del Modal

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.3.1 | Aplicar límite máximo de caracteres en todos los inputs del form de cliente | 🟠 | S | `cliente-schema.ts` con `.max()` en Zod |
| 11.3.2 | Sanitización: solo caracteres permitidos (alfanuméricos + espacios) en nombre, dirección | 🔴 | S | Aplicar `<SanitizedInput>` de Fase 0 |
| 11.3.3 | Eliminar flechas y scroll en inputs de "Límite de Crédito" y "Días de Crédito" | 🟠 | S | Aplicar util de Fase 0.1 |
| 11.3.4 | No permitir un límite de crédito negativo (validar `>= 0` en schema Zod) | 🔴 | S | En `cliente-schema.ts` |
| 11.3.5 | **Validación de RIF:** Al ingresar el RIF, verificar formato SENIAT automáticamente (V/J/G/E + número + dígito verificador) con feedback visual inmediato | 🟠 | M | Función `validateRIF()` + uso en schema |

### 11.4 Controles de Crédito

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.4.1 | Si el cliente intenta una compra que supera su límite de crédito o tiene facturas vencidas, bloquear la venta y requerir PIN de Supervisor | 🟠 | L | Lógica en POS al agregar cliente a factura |

### 11.5 Importación y Exportación

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.5.1 | Crear `import-clientes-modal.tsx` con las mismas protecciones: límite 500, MIME validation, previsualización, bulk insert | 🟡 | L | Nuevo modal |
| 11.5.2 | Validación de unicidad de RIF/Cédula durante la importación. Si ya existe, marcar como conflicto con opción "Actualizar" o "Saltar" | 🟠 | M | Cross-check durante parse |
| 11.5.3 | Botón de exportación de clientes a CSV/Excel | 🟡 | M | Función de export similar a `productos-export.ts` |

### 11.6 Filtros Avanzados (Post-MVP)

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 11.6.1 | Filtros adicionales: Clientes con deuda activa, Clientes inactivos (sin compras en 30 días), Clientes por zona/ciudad | 🟢 | L | Filtros avanzados en toolbar del DataTable |

---

## Fase 12 — Proveedores
> **Estado actual:** `proveedor-form.tsx`, `proveedor-schema.ts`, `use-proveedores.ts`, ruta `_app/proveedores/gestion.tsx` existen.

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 12.1 | **Lazy Loading:** No cargar todos los proveedores al entrar. Mostrar Top 20 por volumen de compras o dejar tabla vacía en espera de búsqueda | 🟡 | M | Cambiar query en `use-proveedores.ts` |
| 12.2 | Sanitizar inputs del formulario: limitar a caracteres alfanuméricos + espacios, aplicar `maxLength` | 🔴 | S | En `proveedor-schema.ts` + `<SanitizedInput>` |
| 12.3 | Eliminar flechas y scroll en inputs de "Días de Crédito" y "Límite de Crédito" | 🟠 | S | Aplicar util de Fase 0.1 |
| 12.4 | No permitir un límite de crédito negativo (`>= 0` en Zod) | 🔴 | S | `proveedor-schema.ts` |
| 12.5 | Evaluar integración del módulo de Proveedores como sub-sección del módulo de Compras y Gastos para simplificar el panel lateral | 🟢 | L | Decisión de UX/arquitectura — evaluar impacto |

---

## Fase 13 — Compras y Gastos
> **Estado actual:** Rutas `_app/compras/facturas.tsx`, `cxp.tsx`, `gastos.tsx`. Hooks `use-cxp.ts`, `use-notas-fiscales-compra.ts`, `use-ret-iva-compras.ts`, etc. También `ret-iva-compra-list.tsx` y `ret-islr-compra-list.tsx`.

### 13.1 Mejoras Inmediatas

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 13.1.1 | Renombrar la sección "Facturas" a "Facturas de Compra" en la navegación y en todos los títulos de la pantalla | 🟡 | S | Cambio de label/string en UI |
| 13.1.2 | Eliminar flechas y scroll en el input de **Tasa Interna** | 🟠 | S | Aplicar util de Fase 0.1 |
| 13.1.3 | Eliminar flechas y scroll en el input de **Tasa Proveedor** (aparece al marcar factura con tasa paralela) | 🟠 | S | Aplicar util de Fase 0.1 |
| 13.1.4 | Eliminar flechas y scroll en los inputs de **Costo de Productos** en las líneas de detalle de la factura de compra | 🟠 | S | Aplicar util de Fase 0.1 |
| 13.1.5 | Eliminar flechas y scroll en el input de **Monto** en la sección de Abonos de la factura | 🟠 | S | Aplicar util de Fase 0.1 |

### 13.2 Importación de Cuentas por Pagar

| # | Tarea | Prioridad | Esfuerzo | Notas |
|---|-------|-----------|----------|-------|
| 13.2.1 | Crear `import-cxp-modal.tsx` con botón "Importar Cuentas por Pagar vía Excel/CSV". Aplicar: límite de peso de archivo, límite de registros (500), sanitización de datos, previsualización antes de confirmar | 🟡 | L | Nuevo modal de importación |

---

## Resumen de Fases y Orden de Ejecución

```
FASE 0  │ Hardening Transversal     │ 🔴🟠 │ PRIMERO — Desbloquea todo
FASE 1  │ Departamentos             │ 🟠🟡 │ Fundamento de inventario
FASE 2  │ Depósitos                 │ 🟡   │ Depende de Fase 1 (patrón)
FASE 3  │ Unidades                  │ 🟠🟡 │ Independiente
FASE 4  │ Productos (Import)        │ 🔴🟠 │ Alto impacto — módulo más usado
FASE 5  │ Configuración Empresa     │ 🟠🟡 │ Requiere decisión sobre Wizard
FASE 6  │ Tasa de Cambio            │ 🟠   │ Quick wins
FASE 7  │ Impuestos                 │ 🔴🟠 │ Crítico para integridad fiscal
FASE 8  │ Precios                   │ 🟡   │ Requiere auditoría previa
FASE 9  │ Bancos y Pagos            │ 🟠🟡 │ Parte monetaria crítica
FASE 10 │ Usuarios y Roles          │ 🔴🟠 │ Seguridad de acceso
FASE 11 │ Clientes CRM              │ 🟠🟡 │ Módulo de alto uso
FASE 12 │ Proveedores               │ 🟡   │ Quick wins + lazy load
FASE 13 │ Compras y Gastos          │ 🟠🟡 │ Quick wins + importación
```

---

## Sprints Sugeridos

### Sprint 1 — Seguridad y Quick Wins (Fases 0, 6, 7 parcial, 12 parcial, 13 parcial)
Objetivo: Eliminar todas las vulnerabilidades de inputs y aplicar quick wins de una sola pasada en todos los formularios.
- Fase 0 completa (util de spinners/scroll, `SanitizedInput`, `validateImportFile`, `bulkInsert`)
- Fase 6 completa (Tasa de Cambio)
- Fase 7.3 (mejoras al modal de impuestos)
- Fase 12: ítems 12.2, 12.3, 12.4
- Fase 13: ítems 13.1.1 al 13.1.5
- Fase 3: ítems 3.3 (protección de unidades) y 3.5 (sorting + filtro)
- Fase 1: ítem 1.4.3, 1.4.1

### Sprint 2 — Importaciones (Fases 1, 2, 3 parcial)
Objetivo: Agregar importación masiva a los sub-módulos de inventario que aún no la tienen.
- Fase 1.1 (import departamentos) + 1.2 (duplicados) + 1.3 (audit log)
- Fase 2.1 (import depósitos) + 2.2 (sorting)
- Fase 3.2 (import unidades)

### Sprint 3 — Mejoras al Import de Productos (Fase 4)
Objetivo: Completar y robustecer el flujo de importación existente de productos.
- Fase 4.1 (exclusión de ejemplos, stock_mínimo, barcode, log de errores)
- Fase 4.2 (mapeo de departamento)
- Fase 4.3 (performance) + 4.4 (sorting numérico)

### Sprint 4 — Configuración Fiscal y Usuarios (Fases 5, 7 completa, 10)
Objetivo: Completar la configuración fiscal y asegurar la gestión de acceso.
- Fase 5.2 (campos fiscales, RIF, contribuyente especial)
- Fase 5.3 (talonarios y modo producción)
- Fase 7.1 (pre-carga impuestos) + 7.2 (protección con historial)
- Fase 10.1 (rediseño UI roles/usuarios) + 10.2 (PIN audit) + 10.3 (permisos)

### Sprint 5 — Clientes, Proveedores y Bancos (Fases 8, 9, 11, 12 completa)
Objetivo: Mejorar los módulos de relación con terceros.
- Fase 8 (previa auditoría de Precios)
- Fase 9.1 (bancos) + 9.2 (métodos avanzados — solo categorización)
- Fase 11 completa
- Fase 12 completa + 13.2 (import CxP)

---

## Notas Arquitectónicas Clave

1. **`<SanitizedInput>` como estándar:** Una vez creado en Fase 0, se debe usar en TODOS los formularios nuevos. Documentar en CLAUDE.md.

2. **Patrón de import en 2 pasos:** Parse/Preview → Confirm. Toda importación masiva sigue este patrón. El componente de previsualización debe ser genérico y reutilizable (`<ImportPreviewTable>`).

3. **`bulkInsert` helper:** No crear endpoints de importación que usen bucles. Siempre un único array hacia Supabase con transacción atómica.

4. **`use-supervisor-pin.ts` ya existe:** Antes de implementar cualquier cosa de PIN, auditar lo que ya existe para extender, no duplicar.

5. **Lazy loading como estándar para listas grandes:** Clientes, Proveedores y cualquier lista con potencial de crecimiento ilimitado NO deben cargar todos los registros. Top 20 + búsqueda dinámica.

6. **Inmutabilidad fiscal:** Impuestos y facturas usadas nunca se eliminan. Solo `is_active: false`. Esta regla ya existe en CLAUDE.md y debe reforzarse en los módulos de Impuestos y Talonarios.

7. **Aislamiento multi-tenant en toda query nueva:** Cada hook nuevo debe filtrar por `empresa_id`. Sin excepción.
