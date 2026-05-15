# Plan de Implementación: Importación de Saldos Iniciales CXC / CXP

**Fecha**: 2026-05-15
**Módulos**: Cuentas por Cobrar (`cxc`) + Cuentas por Pagar (`compras/cxp`)
**Motivación**: Permitir migración desde sistemas anteriores. El negocio tiene deudas preexistentes que deben aparecer en ClaraPOS para poder cobrarlas/pagarlas con el flujo normal.

---

## Diagnóstico del Estado Actual

### Lo que ya existe
- `use-cxc.ts` (1140 líneas): flujo completo de pagos, abonos FIFO, reversos
- `use-cxp.ts` (327 líneas): flujo completo de pagos a proveedor, reversos
- `movimientos_cuenta` / `movimientos_cuenta_proveedor`: tablas inmutables ya definidas
- Tipo `CONTADO` y `CREDITO` en `ventas` y `facturas_compra`
- Sin utilidad de parseo CSV en el proyecto

### Lo que falta
- Tipo `SALDO_INICIAL` en `ventas.tipo` y `facturas_compra.tipo`
- Lógica de importación por lote (bulk insert atómico en chunks)
- Utilidad de parseo CSV
- Modales multi-paso de importación para CXC y CXP
- Plantillas CSV descargables

---

## Decisión de Diseño

### ¿Cómo representar los saldos importados?

**Opción elegida: `tipo = 'SALDO_INICIAL'` en ventas/facturas_compra**

| Criterio | Justificación |
|---|---|
| Aparecen en CXC/CXP sin cambiar queries | Los hooks filtran por `saldo_pend_usd > 0`, no por tipo |
| Se cobran/pagan con el flujo existente | `registrarPagoFactura` / `registrarPagoCxP` no cambian |
| Preserva número del sistema anterior | `nro_factura` guarda el número original |
| Trazabilidad | `movimientos_cuenta.tipo = 'SAL'` identifica el origen |
| Sin `ventas_det` / `facturas_compra_det` | Los saldos iniciales no tienen líneas de detalle |

**Descartadas**:
- *Movimiento directo de saldo*: Pierde la referencia de factura, no permite pagar factura específica
- *Nueva tabla de saldos*: Requiere cambios en todos los hooks CXC/CXP

---

## Alcance de Cambios

### Archivos a crear (7 nuevos)

```
front/src/
├── lib/
│   └── csv-parser.ts                               [NUEVO]
├── features/
│   ├── cxc/
│   │   ├── schemas/
│   │   │   └── cxc-import-schema.ts                [NUEVO]
│   │   ├── hooks/
│   │   │   └── use-importar-cxc.ts                 [NUEVO]
│   │   └── components/
│   │       └── importar-cxc-modal.tsx              [NUEVO]
│   └── compras/
│       ├── schemas/
│       │   └── cxp-import-schema.ts                [NUEVO]
│       ├── hooks/
│       │   └── use-importar-cxp.ts                 [NUEVO]
│       └── components/
│           └── importar-cxp-modal.tsx              [NUEVO]
```

### Archivos a modificar (3-5 existentes)

```
front/src/routes/_app/
├── clientes/cuentas-por-cobrar.tsx                 [MODIFICAR] botón + modal
└── compras/cxp.tsx                                 [MODIFICAR] botón + modal

backend/migrations/
└── 0003_add_saldo_inicial_tipo.sql                 [NUEVO - si hay CHECK CONSTRAINT]
```

> **Verificar antes de migrar**: Si `ventas.tipo` y `facturas_compra.tipo` tienen
> `CHECK CONSTRAINT` en PostgreSQL/Supabase, necesitan la migración SQL.
> Si no tienen constraint (solo validación en frontend), no se necesita migración.

---

## Implementación Detallada por Componente

---

### 1. `lib/csv-parser.ts`
**Complejidad: Baja** | **Estimado: ~80 líneas**

Utilidad pura, sin dependencias externas. Responsabilidades:
- Detectar y eliminar BOM (UTF-8/UTF-16)
- Parsear CSV con headers en primera fila
- Mapear headers de forma case-insensitive y tolerante a tildes/espacios
- Retornar filas como objetos + lista de errores de parseo

```typescript
// API esperada
export interface CsvParseResult<T> {
  rows: T[]
  parseErrors: { line: number; message: string }[]
}

export function parseCsv<T>(
  content: string,
  headerMap: Record<string, keyof T>  // alias → campo destino
): CsvParseResult<T>

// Ejemplo de headerMap para CXC:
// { 'identificacion': 'identificacion', 'rif': 'identificacion',
//   'nro_documento': 'nro_documento', 'factura': 'nro_documento', ... }
```

**No requiere** `papaparse` ni otras deps pesadas.

---

### 2. `features/cxc/schemas/cxc-import-schema.ts`
**Complejidad: Baja** | **Estimado: ~40 líneas**

```typescript
export const cxcImportRowSchema = z.object({
  identificacion: z.string().min(3).transform(v => v.toUpperCase().trim()),
  nro_documento:  z.string().min(1).transform(v => v.toUpperCase().trim()),
  fecha:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  monto_usd:      z.coerce.number().positive('Debe ser > 0'),
  tasa:           z.coerce.number().positive().optional(),
  descripcion:    z.string().optional().default(''),
})

export type CxcImportRow    = z.infer<typeof cxcImportRowSchema>
export type CxcImportResult = { fila: number } & (
  | { ok: true;  nro_factura: string }
  | { ok: false; errores: string[] }
)
```

---

### 3. `features/compras/schemas/cxp-import-schema.ts`
**Complejidad: Baja** | **Estimado: ~40 líneas**

Idéntico a CXC pero con campo `rif` (acepta formato VE y alfanumérico libre):

```typescript
export const cxpImportRowSchema = z.object({
  rif:           z.string().min(3).transform(v => v.toUpperCase().trim()),
  nro_documento: z.string().min(1).transform(v => v.toUpperCase().trim()),
  fecha:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  monto_usd:     z.coerce.number().positive('Debe ser > 0'),
  tasa:          z.coerce.number().positive().optional(),
  descripcion:   z.string().optional().default(''),
})
```

---

### 4. `features/cxc/hooks/use-importar-cxc.ts`
**Complejidad: Alta** | **Estimado: ~180 líneas**

Esta es la pieza más crítica. Implementa la inserción atómica por chunks.

#### Lógica por fila (dentro de `db.writeTransaction`):

```
1. Buscar cliente por identificacion → error si no existe
2. Verificar que nro_documento no esté ya importado (unique check)
3. Obtener tasa de cambio actual (si fila no trae tasa)
4. Generar nro_factura siguiente para la empresa (COUNT ventas + 1)
5. Calcular total_bs = monto_usd * tasa
6. INSERT ventas:
   - tipo = 'SALDO_INICIAL', status = 'PENDIENTE'
   - total_usd = monto_usd, saldo_pend_usd = monto_usd
   - total_bs = monto_usd * tasa
   - total_exento_usd = monto_usd (todo exento, sin IVA)
   - total_base_usd = 0, total_iva_usd = 0, total_igtf_usd = 0
   - deposito_id = deposito principal de la empresa
7. Calcular saldo_anterior del cliente
8. INSERT movimientos_cuenta:
   - tipo = 'SAL' (saldo inicial)
   - referencia = nro_documento (número del sistema anterior)
   - monto = monto_usd
   - saldo_anterior, saldo_nuevo = saldo_anterior + monto_usd
   - doc_origen_id = venta.id, doc_origen_tipo = 'SALDO_INICIAL'
9. UPDATE clientes SET saldo_actual = saldo_nuevo WHERE id = cliente_id
```

#### Procesamiento por chunks:

```typescript
export function useImportarCxc() {
  async function importar(
    filas: CxcImportRow[],
    onProgress: (procesadas: number, total: number) => void
  ): Promise<{ exitosos: number; fallidos: CxcImportResult[] }>

  // Chunks de 10 filas para no bloquear UI
  // Cada chunk es una writeTransaction independiente
  // Fallo de chunk no revierte chunks anteriores (comportamiento esperado)
  // Retorna resultado completo: cuántos OK, cuántos fallaron y por qué
}
```

#### Puntos de fallo manejados:
- Cliente no encontrado → error por fila
- `nro_documento` duplicado en ventas de la empresa → error por fila
- Tasa de cambio no disponible y no viene en fila → error por fila
- Error de write transaction → error por chunk (10 filas)

---

### 5. `features/compras/hooks/use-importar-cxp.ts`
**Complejidad: Alta** | **Estimado: ~180 líneas**

Mismo patrón que CXC pero para proveedores:

```
1. Buscar proveedor por rif → error si no existe
2. Verificar que nro_documento no esté ya importado para ese proveedor
3. Obtener tasa de cambio (tasa = tasa_costo = tasa del row o tasa actual)
4. Generar nro_factura siguiente
5. INSERT facturas_compra:
   - tipo = 'SALDO_INICIAL', status = 'PROCESADA'
   - total_usd = monto_usd, saldo_pend_usd = monto_usd
   - tasa = tasa (pactada), tasa_costo = tasa (sin diferencial en saldo inicial)
   - total_exento_usd = monto_usd (todo exento)
   - total_base_usd = 0, total_iva_usd = 0, total_igtf_usd = 0
   - deposito_id = deposito principal
6. Calcular saldo_anterior del proveedor
7. INSERT movimientos_cuenta_proveedor:
   - tipo = 'SAL' (saldo inicial)
   - referencia = nro_documento
   - monto = monto_usd, monto_moneda = monto_usd, moneda_pago = 'USD'
   - tasa_pago = tasa, monto_usd_interno = monto_usd
   - saldo_anterior, saldo_nuevo = saldo_anterior + monto_usd
8. UPDATE proveedores SET saldo_actual = saldo_nuevo WHERE id = proveedor_id
```

> **Nota importante**: El UPDATE a `saldo_actual` en SQLite local es directo.
> En Supabase, el trigger `P0001` lo bloquea, pero PowerSync maneja la sincronización
> del campo vía el bucket de datos (no via UPDATE directo al servidor).
> Este patrón ya existe en `registrarPagoCxP` → seguir el mismo mecanismo.

---

### 6. `features/cxc/components/importar-cxc-modal.tsx`
**Complejidad: Media-Alta** | **Estimado: ~320 líneas**

Modal multi-paso con 5 estados:

#### Paso 1 — Instrucciones
- Descripción del formato esperado
- Botón **"Descargar Plantilla CSV"** → genera y descarga `cxc_plantilla.csv` inline
- Tabla de referencia de campos

```
# Contenido de la plantilla:
identificacion,nro_documento,fecha,monto_usd,tasa,descripcion
V-12345678,FAC-001,2024-01-15,250.00,36.50,Factura sistema anterior
J-87654321-0,FAC-002,2024-02-01,1500.00,,Saldo pendiente cobro
```

> Nota: `tasa` es opcional. Si está vacío, usa la tasa de cambio vigente.

#### Paso 2 — Subir Archivo
- `<input type="file" accept=".csv,.txt">`
- Parseo inmediato al seleccionar el archivo (usa `csv-parser.ts`)
- Validación Zod fila por fila
- Transición automática a Paso 3 si hay filas procesables

#### Paso 3 — Revisión
- Tabla con columnas: `#`, `Identificación`, `Nro. Documento`, `Fecha`, `Monto USD`, `Estado`
- Filas válidas: fondo normal + badge verde "Listo"
- Filas con error: fondo rojo suave + badge rojo + texto del error
- Header con contadores: `"X registros listos · Y con errores"`
- Checkbox: "Importar solo los registros válidos" (pre-marcado)
- Si todos tienen errores → solo botón "Volver"

#### Paso 4 — Importando (Progress)
- Barra de progreso + contador `"X / N procesados"`
- Llamada a `importar(filasValidas, onProgress)`
- No se puede cancelar una vez iniciado

#### Paso 5 — Resultado
- Resumen: `"X registros importados exitosamente"`
- Si hubo fallidos: tabla con las filas que fallaron + motivo
- Botón "Cerrar" → cierra modal y refresca lista CXC

---

### 7. `features/compras/components/importar-cxp-modal.tsx`
**Complejidad: Media-Alta** | **Estimado: ~300 líneas**

Clon de `ImportarCxcModal` con ajustes:
- Campo `rif` en lugar de `identificacion`
- Etiqueta "Proveedor" en lugar de "Cliente"
- Plantilla CSV usa `rif` como primera columna
- Llama a `useImportarCxp()` en lugar de `useImportarCxc()`

```
# Plantilla CXP:
rif,nro_documento,fecha,monto_usd,tasa,descripcion
J-12345678-9,FAC-PROV-001,2024-01-15,500.00,36.50,Deuda proveedor
```

---

### 8. Integración en rutas existentes
**Complejidad: Baja** | **Estimado: ~20 líneas por ruta**

#### `routes/_app/clientes/cuentas-por-cobrar.tsx`
Agregar en el header de la página:
```tsx
{(user.level === 1 || user.level === 2) && (
  <Button variant="outline" onClick={() => setImportarOpen(true)}>
    <Upload className="h-4 w-4 mr-2" />
    Importar Saldos
  </Button>
)}
<ImportarCxcModal open={importarOpen} onClose={() => setImportarOpen(false)} />
```

#### `routes/_app/compras/cxp.tsx`
Mismo patrón con `ImportarCxpModal`.

---

### 9. Migración SQL (condicional)
**Complejidad: Baja** | **Estimado: ~15 líneas**

Solo necesaria si existe CHECK CONSTRAINT en Supabase:

```sql
-- backend/migrations/0003_add_saldo_inicial_tipo.sql
-- Verificar si hay constraint antes de ejecutar:
-- SELECT conname, consrc FROM pg_constraint WHERE conrelid = 'ventas'::regclass;

ALTER TABLE ventas
  DROP CONSTRAINT IF EXISTS ventas_tipo_check;

ALTER TABLE ventas
  ADD CONSTRAINT ventas_tipo_check
  CHECK (tipo IN ('CONTADO', 'CREDITO', 'SALDO_INICIAL'));

ALTER TABLE facturas_compra
  DROP CONSTRAINT IF EXISTS facturas_compra_tipo_check;

ALTER TABLE facturas_compra
  ADD CONSTRAINT facturas_compra_tipo_check
  CHECK (tipo IN ('CONTADO', 'CREDITO', 'SALDO_INICIAL'));
```

---

## Tabla Resumen de Esfuerzo

| # | Componente | Archivo | Complejidad | Líneas est. |
|---|---|---|---|---|
| 1 | Utilidad CSV Parser | `lib/csv-parser.ts` | **Baja** | ~80 |
| 2 | Schema Zod CXC import | `cxc/schemas/cxc-import-schema.ts` | **Baja** | ~40 |
| 3 | Schema Zod CXP import | `compras/schemas/cxp-import-schema.ts` | **Baja** | ~40 |
| 4 | Hook importar CXC | `cxc/hooks/use-importar-cxc.ts` | **Alta** | ~180 |
| 5 | Hook importar CXP | `compras/hooks/use-importar-cxp.ts` | **Alta** | ~180 |
| 6 | Modal importar CXC | `cxc/components/importar-cxc-modal.tsx` | **Media-Alta** | ~320 |
| 7 | Modal importar CXP | `compras/components/importar-cxp-modal.tsx` | **Media-Alta** | ~300 |
| 8 | Integración ruta CXC | `routes/_app/clientes/cuentas-por-cobrar.tsx` | **Baja** | ~20 |
| 9 | Integración ruta CXP | `routes/_app/compras/cxp.tsx` | **Baja** | ~20 |
| 10 | Migración SQL (cond.) | `backend/migrations/0003_...sql` | **Baja** | ~15 |

**Total**: 10 archivos (7 nuevos + 3 modificados) · ~1195 líneas estimadas

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Trigger `P0001` bloquea UPDATE de `saldo_actual` en Supabase | Alto | PowerSync sincroniza el campo via bucket, no via UPDATE directo. El UPDATE local en SQLite es válido. Seguir patrón de `registrarPagoCxP` existente. |
| `nro_factura` duplicado si importación se reintenta | Medio | Verificar existence antes de insertar: `SELECT COUNT(*) FROM ventas WHERE empresa_id=? AND nro_factura=?` |
| Tasa de cambio no existe en la fecha de la factura | Bajo | Usar la última tasa disponible + mostrar advertencia en UI. Hacer `tasa` requerido en plantilla para mayor claridad. |
| Archivo CSV con encoding latin-1 (Windows) | Bajo | Detectar BOM, intentar decodificación alternativa en el parser. |
| Lote grande (>500 filas) bloquea el UI | Bajo | Chunks de 10 + `await new Promise(r => setTimeout(r, 0))` entre chunks para liberar el event loop. |
| Proveedor/Cliente no encontrado pero RIF/ID con variación de formato | Medio | Normalizar búsqueda (trim + uppercase). Mostrar sugerencias en el error de fila. |
| CXP: `tasa_costo` para saldo inicial | Bajo | Setear `tasa_costo = tasa` (sin diferencial cambiario en saldos de apertura). |

---

## Orden de Implementación

```
Semana 1:
  1. csv-parser.ts              ← utilidad base
  2. cxc-import-schema.ts       ← validación CXC
  3. use-importar-cxc.ts        ← lógica núcleo CXC
  4. importar-cxc-modal.tsx     ← UI CXC
  5. Integración ruta CXC       ← prueba end-to-end CXC

Semana 2:
  6. cxp-import-schema.ts       ← validación CXP
  7. use-importar-cxp.ts        ← lógica núcleo CXP (basado en #3)
  8. importar-cxp-modal.tsx     ← UI CXP (basado en #4)
  9. Integración ruta CXP       ← prueba end-to-end CXP
  10. Migración SQL (si aplica)
```

---

## Preguntas a Resolver Antes de Implementar

---

### P1 — ¿Hay CHECK CONSTRAINT en `ventas.tipo` y `facturas_compra.tipo` en Supabase?

**Por qué importa:**
El campo `tipo` en ambas tablas actualmente acepta `'CONTADO'` y `'CREDITO'`. Si existe un
`CHECK CONSTRAINT` a nivel de PostgreSQL que valide estos valores, insertar un registro con
`tipo='SALDO_INICIAL'` fallará con un error de integridad cuando PowerSync intente subir
el cambio local al servidor. El write local en SQLite funcionaría, pero la sincronización
quedaría atascada indefinidamente para esas filas, corrompiendo silenciosamente el estado
de sync.

**Cómo verificarlo:**
```sql
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'ventas'::regclass
  AND contype = 'c';
```

**Impacto en implementación:**
- Si existe → necesita la migración SQL `0003_add_saldo_inicial_tipo.sql` **antes** de
  implementar cualquier otra parte.
- Si no existe → no se necesita ningún cambio en base de datos.

**Respuesta:** _______________

---

### P2 — ¿Los saldos importados deben generar asientos contables?

**Por qué importa:**
El módulo de contabilidad (`asientos_contables`) recibe entradas automáticas de cada
operación: ventas, pagos, compras, etc. Si los saldos importados no generan asientos,
el balance contable no reflejará esas deudas — lo cual es correcto si la contabilidad
del sistema anterior se cierra por separado (saldo de apertura como asiento manual).
Si sí los generan, hay que definir contra qué cuenta contable se debita/acredita el
saldo de apertura, lo que requiere configuración adicional y agrega ~60 líneas al hook.

**Las dos opciones:**

| Opción | Comportamiento | Complejidad extra |
|---|---|---|
| **Sin asientos** (recomendada) | Solo crea el documento y el movimiento de cuenta. El contador hace el asiento de apertura manualmente. | Ninguna |
| **Con asientos** | Genera asiento `DEBE: Cuentas por Cobrar / HABER: Apertura` automáticamente al importar. | Requiere definir cuenta contable de apertura en configuración |

**Respuesta:** _______________

---

### P3 — ¿Deben los saldos iniciales de CXC incluir `deposito_id`?

**Por qué importa:**
La tabla `ventas` tiene `deposito_id NOT NULL`. El campo existe porque una venta descuenta
inventario de un depósito específico. Para un saldo inicial no hay líneas de detalle ni
movimientos de inventario, por lo que el depósito es irrelevante funcionalmente. Sin
embargo, la constraint NOT NULL en la base de datos obliga a poner algún valor.

**Las dos opciones:**

| Opción | Implementación |
|---|---|
| **Depósito principal automático** | El hook busca el primer `deposito` de la empresa y lo usa. El usuario no lo ve ni lo elige. |
| **Depósito seleccionable en el modal** | Se agrega un selector de depósito en el Paso 1 del modal. Útil si el negocio tiene múltiples depósitos y quiere separar el origen contable. |

La primera opción es más simple. La segunda es relevante solo si el módulo de inventario
usa múltiples depósitos y el negocio quiere tener trazabilidad de qué depósito "tenía"
ese saldo.

**Respuesta:** _______________

---

### P4 — ¿Los saldos importados de CXC deben vincularse a una sesión de caja (`sesion_caja_id`)?

**Por qué importa:**
`pagos.sesion_caja_id` y `ventas.sesion_caja_id` permiten cuadrar los ingresos del día
por caja. Un saldo importado **no es un ingreso de caja** — es una deuda que viene del
pasado. Si se asigna a una sesión, aparecería en el cuadre de caja del día de la
importación como si fuera un ingreso real, distorsionando el reporte.

La respuesta casi segura es `NULL`, pero se documenta porque:
- Algunos sistemas registran el saldo inicial como "ingreso diferido" en caja.
- Si se deja NULL, hay que asegurarse de que el cuadre de caja filtre correctamente
  (`WHERE sesion_caja_id IS NOT NULL` o `WHERE tipo != 'SALDO_INICIAL'`).

**Impacto en implementación:**
Si se deja `NULL`: ningún cambio extra.
Si se asigna sesión: el modal necesita un selector de caja + verificar que la sesión
esté abierta al momento de importar.

**Respuesta:** _______________

---

### P5 — ¿Qué nivel de usuario puede ejecutar la importación?

**Por qué importa:**
La importación de saldos iniciales es una operación **irreversible en lote** — no existe
un "desimportar". Un error (subir el archivo equivocado, importar dos veces) duplica
deudas en todos los clientes/proveedores afectados y requiere corrección manual registro
por registro. Por eso el acceso debe estar restringido.

**Las opciones:**

| Nivel | Acceso | Justificación |
|---|---|---|
| Solo nivel 1 (Propietario) | Más restrictivo | Es una operación de configuración inicial, no operativa. Solo el dueño debería migrar datos del sistema anterior. |
| Nivel 1 y 2 (Propietario + Supervisor) | Moderado | Si el supervisor es responsable de la migración de datos, tiene sentido. |

La recomendación es nivel 1 únicamente, pero si el negocio tiene supervisores que
gestionan la migración, nivel 2 también.

**Respuesta:** _______________

---

### P6 — ¿Cómo manejar la unicidad de `nro_documento` al importar?

**Por qué importa:**
Si el usuario importa el mismo archivo dos veces (error común), se duplicarían todas
las facturas. La pregunta es cuál es el criterio de unicidad correcto:

| Criterio | Descripción | Implicación |
|---|---|---|
| `nro_documento + empresa_id` | Un número de factura no puede repetirse en la empresa, sin importar el cliente | Seguro pero rígido: si dos clientes del sistema anterior tienen facturas con el mismo número (ej. ambos tienen "FAC-001"), solo se importa la primera |
| `nro_documento + cliente_id + empresa_id` | El número solo debe ser único por cliente | Permite el escenario anterior, pero la verificación de duplicados es más compleja |
| Solo advertir, no bloquear | Importar siempre y mostrar advertencia si hay posible duplicado | Máxima flexibilidad, mínima protección |

**Respuesta:** _______________
