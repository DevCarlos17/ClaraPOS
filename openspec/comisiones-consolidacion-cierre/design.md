# Design: comisiones-consolidacion-cierre (Cambio B, Pieza 1)

_Date: 2026-08-03 | Scope: cierre-time N-deducciones migration + `nro_gasto` fix only._

## Technical Approach

Same atomic shape as today — no new transaction, no new UI trigger. Two files change inside the existing `cerrarSesionCaja` `writeTransaction`. The accounting decision (obs #976) is authoritative: commissions **keep** posting to `libro_contable`; only the data source changes (single `comision_pct` → N `metodo_cobro_deducciones` rows).

The core refactor extracts the **pure** amount/validation logic out of the tx-coupled hook into a new `lib/deducciones-cierre.ts`, so the spec's scenarios become real Vitest units instead of requiring a PowerSync transaction harness.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Where the per-deducción loop lives | Inside `aplicarComisionSiCorresponde` (already called on the right base in all 3 branches: plain/per-lote/lote-sum) | New wrapper function called from each of the 3 branches separately | Zero duplication; resolves Open Question 1 for free (see below) |
| Amount/validation logic | Extract to pure `resolverDeduccionesCierre()` in new `src/features/caja/lib/deducciones-cierre.ts` | Keep inline in the hook closure | Pure function (no `tx`) → directly Vitest-unit-testable; mirrors existing `lib/generar-asientos.ts` precedent |
| `nro_gasto` format | `POS-COM-{sesionId8}-{metodoId6}-{orden}-{gastoId6}` (UUID-slice suffix, not just sesion+metodo+orden) | The prompt's suggested `POS-COM-{sesionId8}-{metodoId6}-{orden}` (no gasto-uuid suffix) | **Bug found**: the "por lotes" branch (`consolidar_lotes=0`) calls `aplicarComisionSiCorresponde` once **per lote** for the *same* método — same `(sesionId, metodoId, orden)` would repeat across lotes and collide against `gastos`' `UNIQUE(empresa_id, nro_gasto)` constraint. Appending the per-row `gastoId` slice (already generated via `uuidv4()`) guarantees uniqueness per call, matching the `LC-{count}-{uuid6}` pattern already used in `generarAsientos()` |
| Accounting posting failure isolation | try/catch **only** around `generarAsientosGasto` (+ its `cargarMapaCuentas`/`leerMonedaContable` prep) | try/catch the whole `insertarGastoDeduccionEnTx` body | Primary gasto INSERT + tesorería egreso are the transaction's purpose — must hard-fail if broken. Only the secondary `libro_contable` posting degrades to best-effort (mirrors `crearGasto`'s existing catch, upgraded with `console.warn` for visibility since this path is automated/bulk, not a single user submit) |
| Zero-percent active deducción | Skip silently (no gasto, no error) | Post a $0 gasto | Matches today's behavior (`comisionPct.gt(0)` guard); a $0 gasto would violate `insertarGastoDeduccionEnTx`'s existing `montoNativo > 0` hard-fail, which must stay hard for genuinely-misconfigured cases |

## Open Question 1 — Resolved

Non-`PUNTO` bank methods (`TRANSFERENCIA`, `PAGO_MOVIL`, etc.) with `deposito_directo=0` and no lotes fall through to the plain `totalSistemaD` branch (`use-sesiones-caja.ts` ~L1248), which **already** calls `aplicarComisionSiCorresponde(totalSistemaD)`. Since the N-deducciones loop moves inside that function, these methods automatically get their deducciones applied on the native `totalSistemaD` base — no new attribute or branch needed. Resolved.

## Data Flow

```
cerrarSesionCaja (writeTransaction)
  └─ for each método a consolidar:
       consolidarMetodoATesoreriaEnTx(...)         ← ingreso to Tesorería (unchanged)
       aplicarComisionSiCorresponde(montoBaseD)
         ├─ SELECT metodo_cobro_deducciones WHERE metodo_cobro_id=? AND empresa_id=? AND is_active=1 ORDER BY orden
         ├─ resolverDeduccionesCierre({ deducciones, montoBaseD, destinoTipo, nombreMetodo })  ← PURE
         │    → { toPost: DeduccionAPostear[], warning?: string }
         ├─ if warning: console.warn(warning)          (W5: EFECTIVO/caja-fuerte skip)
         └─ for each item in toPost:
              insertarGastoDeduccionEnTx(tx, { ...item, sesionCajaId, usuarioId })
                ├─ HARD: INSERT gastos, gasto_pagos, movimientos_bancarios EGRESO, UPDATE saldo
                └─ BEST-EFFORT (try/catch): generarAsientosGasto → libro_contable
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/caja/lib/deducciones-cierre.ts` | Create | `resolverDeduccionesCierre()` (amount calc + W5 warn + never-orphan hard-fail, pure) and `construirNroGastoDeduccion()` (UUID-slice format, pure) |
| `src/features/caja/hooks/use-sesiones-caja.ts` (~L1014-1250) | Modify | Drop `mc.comision_pct` from the config SELECT and `MetodoConfigRow` type; drop the outer `cargarMapaCuentas`/`cuentasConfig` (dead once `COMISION_BANCARIA` lookup is removed); `aplicarComisionSiCorresponde` becomes SELECT-deducciones → `resolverDeduccionesCierre` → loop `insertarGastoDeduccionEnTx` |
| `src/features/contabilidad/hooks/use-gastos.ts` (~L490-645) | Modify | Rename `insertarGastoComisionEnTx` → `insertarGastoDeduccionEnTx`; replace `COUNT(*)`-based `nro_gasto` with `construirNroGastoDeduccion()`; wrap `generarAsientosGasto` call in try/catch |

## Interfaces / Contracts

```ts
// src/features/caja/lib/deducciones-cierre.ts (NEW, pure — no tx/db)
export interface DeduccionActivaRow {
  id: string; cuenta_gasto_id: string | null; concepto: string
  tipo: string; porcentaje: string; orden: number
}
export interface DeduccionAPostear {
  cuentaGastoId: string; concepto: string; porcentaje: string
  orden: number; montoDeduccionNativo: Decimal
}
export function resolverDeduccionesCierre(params: {
  deducciones: DeduccionActivaRow[]; montoBaseD: Decimal
  destinoTipo: 'BANCO' | 'CAJA_FUERTE'; nombreMetodo: string
}): { toPost: DeduccionAPostear[]; warning?: string } // throws on empty cuenta_gasto_id (>0% row)

export function construirNroGastoDeduccion(params: {
  sesionCajaId: string; metodoCobroId: string; orden: number; gastoId: string
}): string // "POS-COM-{sesion8}-{metodo6}-{orden}-{gasto6}"
```

```ts
// use-gastos.ts — BEFORE
export async function insertarGastoComisionEnTx(tx, p: {
  empresaId, metodoCobroId, bancoEmpresaId, montoComisionNativo, monedaCodigo,
  tasa, cuentaComisionId, sesionCajaId, comisionPct, usuarioId
}): Promise<{ gastoId: string }>

// AFTER
export async function insertarGastoDeduccionEnTx(tx, p: {
  empresaId, metodoCobroId, bancoEmpresaId, montoDeduccionNativo, monedaCodigo,
  tasa, cuentaGastoId, concepto, porcentaje, orden, sesionCajaId, usuarioId
}): Promise<{ gastoId: string }>
```

## Try/Catch Boundary

```
insertarGastoDeduccionEnTx(tx, p)
├─ HARD-FAIL (propagates → aborts cierre, session stays ABIERTA)
│   ├─ validar tasa>0 (VES), montoNativo>0
│   ├─ SELECT monedas.id
│   ├─ INSERT gastos                          ← PRIMARY record
│   ├─ INSERT gasto_pagos                     ← PRIMARY payment trail
│   ├─ SELECT bancos_empresa.saldo_actual
│   ├─ INSERT movimientos_bancarios (EGRESO)  ← PRIMARY tesorería egreso
│   └─ UPDATE bancos_empresa.saldo_actual     ← PRIMARY tesorería balance
└─ BEST-EFFORT (try/catch, console.warn, no rethrow)
    └─ cargarMapaCuentas + leerMonedaContable + generarAsientosGasto → libro_contable
```

One call per deducción (not batched) — simplest option that stays atomic; write volume scales with N×lotes, same order of magnitude as the existing per-lote loop.

## Testability

| Scenario (spec.md) | Layer | Target |
|---|---|---|
| N deducciones → N native-currency amounts, no USD conversion | Unit | `resolverDeduccionesCierre()` |
| EFECTIVO/caja-fuerte método warned & skipped (W5) | Unit | `resolverDeduccionesCierre()` → `warning` set, `toPost=[]` |
| Missing `cuenta_gasto_id` hard-fails | Unit | `resolverDeduccionesCierre()` throws |
| Zero active deducciones — no regression | Unit | `resolverDeduccionesCierre({deducciones:[]})` → `{toPost:[]}` |
| `nro_gasto` UUID-slice, collision-free across lotes/devices | Unit | `construirNroGastoDeduccion()` — same `(sesion,metodo,orden)` + different `gastoId` ⇒ different output; format regex |
| Inactive deducción skipped | Integration | SQL `WHERE is_active=1` filter — needs DB/mock tx |
| VES-native requires `tasaDelDia` | Integration | guard lives in `aplicarComisionSiCorresponde` (tx-coupled) |
| Accounting failure doesn't abort cierre | Integration | mock `generarAsientosGasto` to throw inside a tx double |
| Single-cierre guard / N `anularGasto` reversal | None (unchanged) | existing `status` guard and `anularGasto`, no new tests |

## Migration / Rollout

No schema change (`metodo_cobro_deducciones` exists already). Old `comision_pct` column and rows are left untouched (unused going forward). Revertible via `git revert` of the two modified files plus deletion of the new lib file.

## Residual Risks

- Best-effort accounting catch only `console.warn`s today — no UI-visible trail. Acceptable for Pieza 1 (mirrors `crearGasto`); toast/banner surfacing is a future enhancement, not blocking.
- Per-lote branch now issues up to N-deducciones × M-lotes gasto rows per método per cierre — same order of magnitude as the existing per-lote consolidation loop already in place (proposal risk table, accepted).
