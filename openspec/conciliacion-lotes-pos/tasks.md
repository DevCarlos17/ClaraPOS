# Tasks: Conciliación Legible + Lotes POS

> Change: `conciliacion-lotes-pos` | Implements design.md (T1/T2/T3) against spec.md capabilities `conciliacion-bancaria-legibilidad`, `lotes-pos-cuadre`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR-A ~80-120 · PR-B ~250-350 · PR-C ~100-150 · Total ~430-620 |
| 400-line budget risk | PR-A Low · PR-B High · PR-C Low · Overall High (combined exceeds 400) |
| Chained PRs recommended | Yes |
| Suggested split | PR-A (read-side) → PR-B (schema+capture UI) → PR-C (close-time routing) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask user |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 (T1+T2) | Fix reconciliation display + reference enforcement + readable session id | PR-A | Independent, ships anytime, ~80-120 lines |
| 2 (T3 schema+UI) | New table, hook, Zod schema, batch capture UI, consolidar_lotes toggle | PR-B | Base = PR-A merged or main; ~250-350 lines, own slice is >400-line risk alone if bundled with PR-C |
| 3 (T3 routing) | Close-time branching in `cerrarSesionCaja` steps 8-9 | PR-C | Depends on PR-B (reads `lotes_pos_cuadre`); ~100-150 lines |

---

## Phase 1: PR-A — Reconciliation Read-Side Fixes (T1a, T1b, T2)

- [x] 1.1 `src/features/tesoreria/components/conciliacion-tesoreria.tsx:65` — In `toMovRow()`, change `descripcion: mov.descripcion` to `descripcion: 'observacion' in mov ? (mov.descripcion ?? mov.observacion) : mov.descripcion` (type-guarded, `MovCajaFuerte` has no `observacion`). Satisfies SC-01, SC-02.
- [x] 1.2 `src/lib/format.ts` — Add `export function formatSesionId(id: string): string { return 'SES-' + id.slice(0, 8).toUpperCase() }`.
- [x] 1.3 `src/features/caja/hooks/use-sesiones-caja.ts:1077` — Replace raw `id` in the consolidation `descripcion` template with `formatSesionId(id)` (import from `@/lib/format`). Satisfies SC-05.
- [x] 1.4 `src/features/ventas/components/cobro-modal.tsx` (~L760-780, near `referencia` state at L87 and the `Ref. (opcional)` input at L771-774) — Read `metodoSeleccionado?.requiere_referencia` and block `handleProcesar`/pago-add when `requiere_referencia===1 && !referencia.trim()`; show Spanish error via existing toast/error pattern. Mirror `gasto-form.tsx:1317`. Satisfies SC-03, SC-04.
- [x] 1.5 Verify: `yarn type-check` clean on the 4 touched files (baseline: 308 pre-existing errors confined to `*.test.ts` + 3 unrelated `.tsx` — none of these 4 files should add new errors).
- [ ] 1.6 Manual QA — SC-01: movimiento con `descripcion=NULL`/`observacion="Venta C01-000123"` muestra el texto, no "-". SC-02: ambas vacías → sigue mostrando "-".
- [ ] 1.7 Manual QA — SC-03/SC-04: cobro con "Pago Móvil" (`requiere_referencia=1`) sin ref → bloqueado con mensaje en español; método con `requiere_referencia=0` → pago se agrega sin ref.
- [ ] 1.8 Manual QA — SC-05: cerrar una sesión y confirmar que la descripción de consolidación muestra `SES-XXXXXXXX` (8 chars, mayúsculas), no el uuid completo.
- [ ] 1.9 Non-regression: confirmar que ninguna otra fila de conciliación existente (movimientos ya con `descripcion` no-null) cambia de valor mostrado.

## Phase 2: PR-B — Schema + Batch Capture UI (T3, foundation)

- [x] 2.1 **[MANUAL/EXTERNAL — not run by apply]** Create `migrations/0079_lotes_pos_cuadre.sql` with the exact SQL from design.md (table `lotes_pos_cuadre`, indexes, `trg_lotes_pos_cuadre_updated`, RLS SELECT+INSERT+UPDATE+DELETE via `public.current_empresa_id()`, `ALTER TABLE metodos_cobro ADD COLUMN consolidar_lotes BOOLEAN NOT NULL DEFAULT TRUE`). File creation is an apply task; **applying it in Supabase SQL Editor is a manual step for the USER**, same as 0077/0078 — flag this to the user before/at close of this slice.
- [x] 2.2 `src/core/db/powersync/schema.ts` — Add `lotes_pos_cuadre` `Table` definition (columns: `empresa_id`, `sesion_caja_id`, `metodo_cobro_id`, `moneda_id`, `nro_lote` text, `monto` `column.text` (decimal-as-text convention), `created_at`, `created_by`). Add `consolidar_lotes: column.integer` to the existing `metodos_cobro` Table definition.
- [x] 2.3 `src/core/db/kysely/types.ts` — Mirror `lotes_pos_cuadre` row type and add `consolidar_lotes` to `MetodosCobro` type, matching the boolean-as-integer / decimal-as-string conventions used elsewhere in this file.
- [x] 2.4 `src/features/caja/schemas/lote-pos-schema.ts` (new) — Zod schema `{ metodo_cobro_id: z.string().uuid(), nro_lote: z.string().min(1), monto: z.number().positive() }` per design's Interfaces/Contracts section.
- [x] 2.5 `src/features/caja/hooks/use-lotes-pos.ts` (new) — Implement `useLotesPos(sesionCajaId)` returning `{ lotesPorMetodo: Record<string, LotePos[]>, isLoading }` (live PowerSync query filtered by `sesion_caja_id` and `empresa_id`), plus `agregarLote`, `actualizarLote`, `eliminarLote` per the exact signatures in design.md's Interfaces/Contracts. Each write is a live `db.writeTransaction()` (INSERT/UPDATE/DELETE), not buffered.
- [x] 2.6 `src/features/reportes/components/cuadre-conteo-fisico.tsx` (~L294-339, near `onConteoFisicoChange` at L190-191) — For methods where `m.tipo === 'PUNTO'`, render a batch mini-table (add row, edit monto/nro_lote, delete row) sourced from `useLotesPos`, replacing the single "Físico" input for that method only. `sum(lotes)` for the method feeds the existing `onConteoFisicoChange(conteo, totalMetodos)` call exactly as the single input did. Methods where `tipo !== 'PUNTO'` MUST render unchanged (SC-06, SC-07, SC-08).
- [x] 2.7 `src/features/configuracion/schemas/payment-method-schema.ts` (near L14 `requiere_referencia`) — Add `consolidar_lotes: z.boolean().default(true)`.
- [x] 2.8 `src/features/configuracion/components/payment-method-form.tsx` — Add a toggle for `consolidar_lotes`, rendered only when `tipo === 'PUNTO'`.
- [x] 2.9 Verify: `yarn type-check` clean on all files touched in 2.1-2.8 (no new errors beyond the 308 pre-existing baseline).
- [ ] 2.10 Manual QA — SC-06: en "Tarjeta Débito" (POS) agregar lote "10" $5000 y lote "11" $5500 → total del método muestra $10500.
- [ ] 2.11 Manual QA — SC-07: editar un lote existente de $5000 a $5200 y borrar otro → el total recalcula reflejando ambos cambios antes de cerrar.
- [ ] 2.12 Manual QA — SC-08: cargar lote "10" en "Tarjeta Débito" y lote "10" en "Tarjeta Crédito" en el mismo cuadre → sin error de unicidad (constraint es por `metodo_cobro_id`, no global).
- [ ] 2.13 Manual QA — SC-09: cargar un lote offline, reconectar, confirmar que sincroniza a Supabase con `empresa_id` correcto.
- [ ] 2.14 Non-regression: abrir cuadre de una sesión con solo métodos no-POS (Efectivo, Transferencia) → UI idéntica a antes de este cambio, sin tabla de lotes visible en ningún método.

## Phase 3: PR-C — Close-Time Routing (T3, financial)

> Depends on Phase 2 (reads `lotes_pos_cuadre`, needs `consolidar_lotes` column).

- [x] 3.1 `src/features/caja/hooks/use-sesiones-caja.ts` (~L968-972, `metodosParaConsolidar` build step, "step 8") — Inside `cerrarSesionCaja`'s existing `writeTransaction`, add a `SELECT nro_lote, monto FROM lotes_pos_cuadre WHERE sesion_caja_id = ? GROUP BY metodo_cobro_id` and build a `lotesPorMetodoMap`. Must execute in the same transaction, before the consolidation loop.
- [x] 3.2 `src/features/caja/hooks/use-sesiones-caja.ts` (~L1008-1123, the `for (const [metodoCobroId, { totalSistemaD, monedaId }] of metodosParaConsolidar)` loop, "step 9") — Branch per design's Data Flow:
  - `lotes = lotesPorMetodoMap.get(metodoCobroId)` (only non-empty for `tipo='PUNTO'` methods with captured batches).
  - If `lotes` exist: `consolidar_lotes=1` → ONE `consolidarMetodoATesoreriaEnTx(monto=SUM(lotes), descripcion=".. Lotes: 10, 11")`, commission on the total. `consolidar_lotes=0` → N× `consolidarMetodoATesoreriaEnTx` (one per lote, `descripcion=".. Lote 10"`), N× `insertarGastoComisionEnTx` each on its own monto.
  - Else (no lotes, current behavior): unchanged call using `totalSistemaD` (existing code path, do not modify).
  - The batch sum REPLACES `totalSistemaD` as the transfer amount for methods with lotes — never summed on top (avoids double-counting per design's highest-risk decision). `sesiones_caja_detalle.total_sistema` (step 6, L872-915) stays pagos-derived and untouched.
- [x] 3.3 Confirm Opción 1 ordering is preserved: all consolidation/lote-routing inserts (step 8-9, including 3.1/3.2) still execute BEFORE the `UPDATE ... status = 'CERRADA'` (currently ~L1132), unchanged relative position. Do not reorder the final status UPDATE.
- [x] 3.4 Confirm destino-moneda validation (existing fail-close check, resolved per method before the lote branch) is reused unchanged and runs before any lote-transfer insert for that method, so a currency mismatch aborts before any lote traspaso is written (SC-12).
- [x] 3.5 Verify: `yarn type-check` clean on `use-sesiones-caja.ts` (no new errors beyond the 308 pre-existing baseline).
- [ ] 3.6 Manual QA — SC-10 (consolidado): método con `consolidar_lotes=true`, lotes "10" ($5000) y "11" ($5500) → al cerrar, Tesorería muestra UN traspaso de $10500, descripción incluye "Lotes: 10, 11", comisión sobre $10500.
- [ ] 3.7 Manual QA — SC-11 (por lote): mismo método con `consolidar_lotes=false` → Tesorería muestra DOS traspasos ($5000 y $5500), cada uno con su propia comisión.
- [ ] 3.8 Manual QA — SC-12 (mismatch moneda): método POS en Bs con lote cuyo destino resuelto está en USD → cierre completo aborta con error en español nombrando el método; sesión permanece `ABIERTA`; ningún traspaso persiste.
- [ ] 3.9 Manual QA / non-regression — SC-13 (HARD): sesión mixta "Efectivo USD" (sin lotes) + "Tarjeta Débito" (POS, 2 lotes) → cerrar. "Efectivo USD" genera su depósito exactamente como antes (byte-identical path via `totalSistemaD`); "Tarjeta Débito" enruta según `consolidar_lotes`; ningún otro método o cálculo cambia.
- [ ] 3.10 Manual QA / atomicity — SC-14: cierre con lotes válidos en un método y OTRO método sin destino de banco configurado → el método sin destino falla, TODO el cierre revierte (incluidos los traspasos de lote ya "sumados" en memoria), `status` permanece `ABIERTA`, error en español nombra el método sin destino.
- [ ] 3.11 Non-regression: sesión sin ninguna fila en `lotes_pos_cuadre` (incluyendo métodos `tipo='PUNTO'` sin lotes cargados) → recorre el `ELSE` branch, comportamiento idéntico al código actual pre-cambio.

---

## Cross-Cutting Notes

- Migration 0079 (task 2.1) must be applied by the **user** in the Supabase SQL Editor before Phase 2/3 manual QA can pass end-to-end — same manual-apply pattern as 0077/0078. Flag this explicitly when Phase 2 is ready for review.
- No test runner or ESLint script exists in this project; verification per slice is `yarn type-check` (baseline: 308 pre-existing errors confined to `*.test.ts` files + 3 unrelated `.tsx` files) plus fresh-context adversarial review plus the manual QA checklist items above.
- Chain strategy (stacked-to-main vs feature-branch-chain vs size:exception) is not yet chosen — ask the user before starting PR-B, since PR-B alone risks the 400-line budget and PR-B+PR-C together exceed it.
