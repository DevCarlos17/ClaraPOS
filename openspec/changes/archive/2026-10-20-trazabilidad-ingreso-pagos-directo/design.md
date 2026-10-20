# Design: Trazabilidad Ingreso de Tesorería ↔ Pagos (Camino Directo)

## Technical Approach

Una tabla puente append-only (`movimientos_bancarios_pagos`) + 2 sitios de
INSERT aditivos en `src/features/cxc/hooks/use-cxc.ts`. Mirror estructural
exacto de `migrations/0112_pagos_aplicaciones.sql` (sin trigger, sin
backfill). Solo cubre el camino directo (`deposito_directo=1`,
`origen='TRANSFERENCIA_CLIENTE'`) — el camino batch/lote ya cierra via el
chain existente (`pago.sesion_caja_id`+`metodo_cobro_id` → `traspasos_tesoreria`),
confirmado en `sdd/reverso-abono-tesoreria/explore-diseno-puente` (#5563).

## Architecture Decisions

| Decisión | Alternativas rechazadas | Rationale |
|---|---|---|
| Tabla join, no columna | `pago_id` suelto en `movimientos_bancarios` | Fan-in real: 1 ingreso ↔ N `pago_id` en abono-global FIFO. Locked en #5563. |
| Sin backfill, arranca vacía | Backfill heurístico por timestamp/venta_id | Data de prueba; replay de ledger ya rechazado como riesgo (precedente 0112/0105). Ingresos pre-migración quedan no-reversables (gap documentado). |
| RLS append-only, sin trigger | Trigger de inmutabilidad (estilo `trg_kardex_no_update`) | Mirror exacto `pagos_aplicaciones`: auditoría app-trusted, sin "lote" padre cuyo saldo proteger. Sin policy UPDATE/DELETE ya bloquea mutación; PUT reintentado de PowerSync converge via `ON CONFLICT DO NOTHING` (connector.ts L602-604) una vez en `IMMUTABLE_TABLES`. |
| Corregir también el gap de `pagos_aplicaciones` en sync-rules.yaml, en este mismo PR | Diferirlo (es deuda preexistente, fuera del scope declarado) | Confirmado por lectura directa: `pagos_aplicaciones` NO aparece en `powersync-sync-rules.yaml` (solo `saf_creditos_aplicaciones` sí). Fix de 1 línea, mismo archivo que ya tocamos, cero riesgo — dejarlo sin corregir repite la MISMA clase de bug que este change existe para prevenir. |
| Quirk `movId`-fantasma: fuera de alcance, solo documentado | Agregar guard en `registrarAbonoGlobal` | Ortogonal: el puente usa `pago_id` (siempre real), nunca `movId`. Tocarlo mezcla un fix no relacionado (semántica de `doc_origen_id` en el caso 100%-excedente) en este change. Deuda técnica para un change futuro. |

## Data Flow

```
aplicarPagoFacturaEnTx (caso simple):
  pagoId (L563) ──┐
  INGRESO INSERT ──┼─→ ingresoBancarioId (hoisted) ─→ bridge INSERT (1 fila)
  montoUsd ────────┘

registrarAbonoGlobal (FIFO fan-in):
  loop FIFO → N × {pagoId, montoAplicar} ──┐
  anticipo  → 0|1 × {pagoAnticipoId, montoRestante} ─┼─→ bridgeEntries[]
                                                       │
  INGRESO INSERT (movBancoAbonoId) ────────────────────┴─→ N|N+1 bridge INSERTs
```

## Interfaces / Contracts

### `migrations/0117_movimientos_bancarios_pagos.sql`

```sql
CREATE TABLE IF NOT EXISTS public.movimientos_bancarios_pagos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id),
  ingreso_id         UUID NOT NULL REFERENCES public.movimientos_bancarios(id),
  pago_id            UUID NOT NULL REFERENCES public.pagos(id),
  monto_aplicado_usd NUMERIC(20,8) NOT NULL CHECK (monto_aplicado_usd > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_ingreso ON public.movimientos_bancarios_pagos (ingreso_id);
CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_pago    ON public.movimientos_bancarios_pagos (pago_id);
CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_empresa ON public.movimientos_bancarios_pagos (empresa_id);

ALTER TABLE public.movimientos_bancarios_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON public.movimientos_bancarios_pagos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON public.movimientos_bancarios_pagos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin policy UPDATE/DELETE — append-only, mismo patron 0112/0105.

-- PowerSync publication (patron idempotente 0098/0112)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='movimientos_bancarios_pagos') THEN
    ALTER PUBLICATION powersync ADD TABLE public.movimientos_bancarios_pagos;
  END IF;
END $$;
```

Sin `cliente_id` denormalizado (a diferencia de `pagos_aplicaciones`): ningún
read-path de este change filtra por cliente directo sobre esta tabla; lecturas
futuras (preview/reverso) hacen join `pago_id → pagos.cliente_id`. YAGNI —
agregar la columna en un change futuro si un read-path lo necesita indexado.

### `schema.ts` (mirror `pagos_aplicaciones`, ~L810)

```ts
const movimientos_bancarios_pagos = new Table(
  {
    empresa_id: column.text,
    ingreso_id: column.text,
    pago_id: column.text,
    monto_aplicado_usd: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  {
    insertOnly: true,
    indexes: {
      idx_mov_banc_pagos_ingreso: ['ingreso_id'],
      idx_mov_banc_pagos_pago: ['pago_id'],
      idx_mov_banc_pagos_empresa: ['empresa_id'],
    },
  }
)
```
Registrar en el mapa de tablas exportado (junto a `pagos_aplicaciones`, ~L1846).

### `connector.ts`
Agregar `'movimientos_bancarios_pagos'` a `IMMUTABLE_TABLES` (~L177), mismo
comentario-patrón que `pagos_aplicaciones`.

### `backend/powersync-sync-rules.yaml`
Bajo `# --- CAJA / TESORERIA ---` (junto a `movimientos_bancarios`, ~L129):
```yaml
- SELECT * FROM movimientos_bancarios_pagos WHERE empresa_id = bucket.empresa_id
```
Fix del gap preexistente, bajo `# --- CLIENTES / CXC ---` (junto a
`saf_creditos_aplicaciones`, ~L113):
```yaml
- SELECT * FROM pagos_aplicaciones WHERE empresa_id = bucket.empresa_id
```

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/0117_movimientos_bancarios_pagos.sql` | Create | Tabla puente, índices, RLS append-only, publication |
| `src/core/db/powersync/schema.ts` | Modify | Nueva `Table` `insertOnly:true` + registro en mapa |
| `src/core/db/powersync/connector.ts` | Modify | Agregar a `IMMUTABLE_TABLES` (~L177) |
| `backend/powersync-sync-rules.yaml` | Modify | Nueva línea CAJA/TESORERIA + fix gap `pagos_aplicaciones` en CXC |
| `src/features/cxc/hooks/use-cxc.ts` | Modify | `aplicarPagoFacturaEnTx` (~L726-744), `registrarAbonoGlobal` (~L1108-1458) |
| `src/features/cxc/hooks/__tests__/*.test.ts` | Create/Modify | 4 casos del bridge (spec) |

## Wiring — `aplicarPagoFacturaEnTx` (L500-767)

Hoy (L732) el INGRESO se inserta con `uuidv4()` inline, nunca capturado.
Cambio: hoistear a un const nombrado, inmediatamente antes del INSERT
existente (sin reordenar nada):

```ts
const ingresoBancarioId = uuidv4()
await tx.execute(`INSERT INTO movimientos_bancarios (...) VALUES (?, ...)`,
  [ingresoBancarioId, empresa_id, bancoCxCId, /* ... */])
```

Inmediatamente DESPUÉS del `UPDATE bancos_empresa` existente (L741-744) —
puramente aditivo:

```ts
await tx.execute(
  `INSERT INTO movimientos_bancarios_pagos (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [uuidv4(), empresa_id, ingresoBancarioId, pagoId, toStorageString(montoUsd), now, procesado_por]
)
```
`pagoId` (L563) y `montoUsd` ya en scope — cero reads nuevos.

## Wiring — `registrarAbonoGlobal` (L926-1483)

Declarar antes del loop FIFO (antes de L1108):
```ts
const bridgeEntries: Array<{ pagoId: string; montoAplicadoUsd: Decimal }> = []
```
Dentro del loop, tras el INSERT a `pagos` (después de L1142):
```ts
bridgeEntries.push({ pagoId, montoAplicadoUsd: montoAplicar })
```
Tras el bloque de anticipo (después de L1228, solo si se creó):
```ts
if (pagoAnticipoId) bridgeEntries.push({ pagoId: pagoAnticipoId, montoAplicadoUsd: montoRestante })
```
`montoTotalUsd = Σ montoAplicar (FIFO) + montoRestante` por construcción
(L1241) → N filas sin excedente, N+1 con excedente (spec escenario 3).

Dentro del `if` existente de banco directo (L1413), tras el `UPDATE
bancos_empresa` (L1455-1458):
```ts
for (const entry of bridgeEntries) {
  await tx.execute(
    `INSERT INTO movimientos_bancarios_pagos (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), empresa_id, movBancoAbonoId, entry.pagoId, toStorageString(entry.montoAplicadoUsd), now, procesado_por]
  )
}
```
`movBancoAbonoId` (L1414) ya está en scope — sin hoisting aquí. `bridgeEntries`
se construye siempre (array en memoria, misma tx) pero solo se flushea dentro
del `if` de banco directo — métodos batch nunca entran a ese bloque, 0 filas
puente (spec requirement 4).

## Testing Strategy

| Caso | Escenario | Assertion |
|---|---|---|
| Simple | `aplicarPagoFacturaEnTx`, 1 factura | 1 fila, `ingreso_id` == id real insertado en la misma tx |
| FIFO sin excedente | `registrarAbonoGlobal`, N facturas, pago exacto | N filas, Σ `monto_aplicado_usd` == monto ingreso |
| FIFO + excedente | `registrarAbonoGlobal`, N facturas + remanente→SAFC | N+1 filas |
| No-directo | `deposito_directo=0` | 0 filas puente, sin escritura a la tabla |

## Migration / Rollout

0a-schema: `DROP TABLE IF EXISTS movimientos_bancarios_pagos;` + revertir
`schema.ts`/`connector.ts`/`sync-rules.yaml`. 0a-wiring: revertir solo los
INSERT agregados — los writes existentes (`pagos`/`movimientos_bancarios`/
`movimientos_cuenta`) quedan intactos.

## Slice Boundaries

PR1 = 0a-schema (migración + schema.ts + connector.ts + sync-rules, ~100-150
líneas). PR2 = 0a-wiring (2 sitios + tests, ~100-150 líneas), **depende de
PR1** (necesita la tabla + entrada en `schema.ts` para que el INSERT
tipifique). Stacked PR2 → PR1 → branch objetivo.

## Open Questions

- [ ] Ninguna bloqueante. Quirk `movId`-fantasma (100%-excedente,
      `movimientos_cuenta` nunca insertado pero referenciado como
      `doc_origen_id`) queda documentado como deuda técnica preexistente,
      fuera de alcance — ver Architecture Decisions.
