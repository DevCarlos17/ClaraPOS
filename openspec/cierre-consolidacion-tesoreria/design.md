# Design: Cierre → Consolidación automática a Tesorería

## Technical Approach

Extend `cerrarSesionCaja`'s existing `writeTransaction` with two new steps after the current SAF snapshot (step 7): **step 8** re-reads per-method config for the methods already summarized in `sesiones_caja_detalle` (step 6), and **step 9** loops those methods, routing each `totalSistemaD > 0` to its destination (caja fuerte or banco) via a new tx-scoped helper, and — for commission-bearing methods — additionally books a machine-generated `gastos` row (Option A2). Everything stays inside one atomic transaction; any failure (missing destination, missing "comisiones bancarias" account) rolls back the whole cierre. No new top-level `writeTransaction` is opened anywhere in this path (PowerSync forbids nesting).

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Bank-side `origen` | New value **`CIERRE_CONSOLIDACION`** on `movimientos_bancarios_origen_check` | Reuse `DEPOSITO_CAJA` | Symmetric with the reserved-but-unused `DEPOSITO_CIERRE` on the caja-fuerte side; keeps automatic cierre deposits filterable/auditable separately from ad-hoc manual bank deposits in `conciliacion-bancaria.tsx` reports. Cost is one CHECK value + 2 label-dict entries. |
| Comisiones-bancarias account | New `cuentas_config` clave **`COMISION_BANCARIA`** (added to `CLAVES_CONFIG`), resolved per-tenant via existing `cargarMapaCuentas` | Hardcoded/default account | `cuentas_config` is already the generic tenant-configurable clave→cuenta map; no schema change needed, only a UI-configurable entry. No safe default exists across tenants (each has its own plan de cuentas) — fabricating one would misfile a real expense. |
| Missing `COMISION_BANCARIA` config | **Hard-fail** the whole cierre, Spanish error naming the method and instructing to configure it in Configuración Contable | Silent skip / auto-create account | Consistent with Locked Decision #3 (no silent money loss/misrouting); an auto-created account could land in the wrong place in a tenant's chart of accounts. |
| `deposito_directo` semantics | **No special-casing** in this change | Exclude such methods from consolidation | Grepped `use-ventas.ts`/`use-cxc.ts`: the flag is fetched (`_depositoDirecto`) but never branches any logic — payments for such methods still land in `metodos_cobro.saldo_actual` and flow into `sesiones_caja_detalle` identically to any other method. No double-count risk exists today. **TODO flag**: if a future change wires this flag to bypass `metodos_cobro.saldo_actual` at payment time, that change must then exclude such methods here. |
| Nesting-safety for money movement | Refactor `crearTraspasoSesionATesoreria` body into tx-taking `consolidarMetodoATesoreriaEnTx`; existing export becomes a thin `db.writeTransaction` wrapper around it | Duplicate the function | Preserves the existing public API for manual retiro flows while giving `cerrarSesionCaja` a nestable call. |

## Data Flow

    cerrarSesionCaja(id, params)  [single writeTransaction]
      1-6. (existing) validate ABIERTA, compute montoSistema*, UPDATE sesiones_caja,
           populate sesiones_caja_detalle from metodosUsadosResult
      7.   (existing) SAF virtual row (metodo_cobro_id = NULL) — untouched
      8.   NEW: batch SELECT metodos_cobro (banco_empresa_id, caja_fuerte_id,
           comision_pct, tipo, moneda_id) for IDs in metodosUsadosResult
      9.   NEW: for each metodosUsadosResult row with totalSistemaD > 0:
             a. skip if metodo_cobro_id IS NULL (defensive; SAF never appears here)
             b. resolve destino (tipo EFECTIVO → caja_fuerte by moneda_id;
                otherwise → banco_empresa_id) — hard-fail if none
             c. consolidarMetodoATesoreriaEnTx(tx, {…, destino, monto: totalSistemaD})
             d. if comision_pct > 0: resolve cuenta COMISION_BANCARIA (hard-fail if
                missing) → insertarGastoComisionEnTx(tx, {…})
      (commit) or (rollback entirely on any thrown error)

## Interfaces / Contracts

```ts
// use-traspasos.ts
type DestinoConsolidacion =
  | { tipo: 'CAJA_FUERTE'; id: string }
  | { tipo: 'BANCO'; id: string }

export async function consolidarMetodoATesoreriaEnTx(
  tx: WriteTx,
  p: {
    sesionCajaId: string; metodoCobroId: string; destino: DestinoConsolidacion
    monto: string; monedaId: string; empresaId: string; userId: string
    origenDestino: 'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION'; descripcion?: string
  }
): Promise<{ traspasoId: string }>
// Body = current crearTraspasoSesionATesoreria logic, generalized: branches
// mov_caja_fuerte vs movimientos_bancarios by destino.tipo, decrements
// metodos_cobro.saldo_actual (EGRESO_TESORERIA), inserts destino row validado=0,
// inserts traspasos_tesoreria (cuenta_origen_tipo='SESION_CAJA', sesion_caja_id).
// crearTraspasoSesionATesoreria(params) becomes: db.writeTransaction(tx =>
//   consolidarMetodoATesoreriaEnTx(tx, { ...params, destino: { tipo: 'CAJA_FUERTE', id } }))

// use-gastos.ts (new export)
export async function insertarGastoComisionEnTx(
  tx: WriteTx,
  p: {
    empresaId: string; metodoCobroId: string; bancoEmpresaId: string
    montoComisionNativo: string; monedaCodigo: 'USD' | 'VES'; tasa: number
    cuentaComisionId: string; sesionCajaId: string; comisionPct: string; usuarioId: string
  }
): Promise<{ gastoId: string }>
// INSERT gastos (proveedor_id=NULL, status='REGISTRADO', tipo_impuesto='Exento',
//   porcentaje_iva=0, saldo_pendiente_usd='0.00', cuenta_id=cuentaComisionId,
//   metodo_cobro_id/banco_empresa_id set for traceability only)
// INSERT one gasto_pagos row (metodo_cobro_id=NULL, banco_empresa_id=bancoEmpresaId)
//   -- NULL metodo_cobro_id here is deliberate: avoids a second EGRESO_TESORERIA
//   -- against a balance already drained by consolidarMetodoATesoreriaEnTx.
// INSERT movimientos_bancarios EGRESO (origen='GASTO', reuse existing value)
//   + UPDATE bancos_empresa.saldo_actual (nets the gross deposit)
// generarAsientosGasto(tx, { pagos: [{ monto_usd: comisionUsd, banco_empresa_id }] })
```

**Why not call the existing `crearGasto()`**: it (a) opens its own `writeTransaction` (cannot nest) and (b) its pago loop *unconditionally* inserts a `movimientos_metodo_cobro` EGRESO using `metodo_cobro_id`, which would double-drain a balance `consolidarMetodoATesoreriaEnTx` already zeroed. `insertarGastoComisionEnTx` is a minimal, purpose-built insert that reuses `generarAsientosGasto` (safe — it only touches `libro_contable`, never `metodos_cobro`).

## Currency Correctness

- Commission computed in the **method's own moneda** (`totalSistemaD_native * comision_pct/100`), matching `moneda_factura`. USD equivalent via `bsToUsd(comisionBs, tasaDelDia)` (existing `lib/currency` helper), never a raw multiply.
- `tasa` on the gasto = session's `tasaDelDia`. If a Bs-denominated commission-bearing method has activity but `tasaDelDia` is missing/zero → hard-fail (gasto's `tasa NOT NULL CHECK(tasa>0)` cannot be satisfied safely).
- `traspasos_tesoreria.monto_origen`/`monto_destino` use the method's own `moneda_id` on both sides (`tasa_cambio='1'`), never mixed with the commission's currency math — same pattern as existing `crearTraspasoSesionATesoreria`.

## Reversal Behavior

Per explore §6: once `CERRADA`, the `SESION_CAJA`-origin leg of `reversarTraspaso` is blocked — unchanged, acceptable. Tesorería can still reject/adjust the pending `BANCO`/`CAJA_FUERTE` leg via the existing `reversarTraspaso` (unblocked for those destino types). A wrongly-consolidated commission `gasto` is corrected via the existing `anularGasto` (generates reversal asientos). No new reversal mechanism needed.

## Edge Cases

| Case | Behavior |
|---|---|
| Commission but no `banco_empresa_id` | Destino resolution fails first → whole cierre hard-fails before commission logic runs |
| No destination at all | Same hard-fail, names the method |
| Zero-total method | Never enters step 9 loop (mirrors step 6's existing filter) |
| `is_reversed` payments | Already net via upstream `metodosUsadosResult` query — no new handling |
| SAF (`metodo_cobro_id IS NULL`) | Structurally absent from `metodosUsadosResult`; defensive `continue` guard added anyway |
| Concurrent closes racing same `caja_fuerte.saldo_actual` | Pre-existing read-then-write race, unchanged — out of scope, documented only |

## Migration 0077 (idempotent, follows 0073/0027 pattern)

```sql
ALTER TABLE traspasos_tesoreria DROP CONSTRAINT IF EXISTS traspasos_tesoreria_cuenta_origen_tipo_check;
ALTER TABLE traspasos_tesoreria ADD CONSTRAINT traspasos_tesoreria_cuenta_origen_tipo_check
  CHECK (cuenta_origen_tipo IN ('BANCO','CAJA_FUERTE','SESION_CAJA'));
ALTER TABLE traspasos_tesoreria DROP CONSTRAINT IF EXISTS traspasos_tesoreria_cuenta_destino_tipo_check;
ALTER TABLE traspasos_tesoreria ADD CONSTRAINT traspasos_tesoreria_cuenta_destino_tipo_check
  CHECK (cuenta_destino_tipo IN ('BANCO','CAJA_FUERTE','SESION_CAJA'));

ALTER TABLE movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_check;
ALTER TABLE movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_check
  CHECK (origen IN ('DEPOSITO_CAJA','TRANSFERENCIA_CLIENTE','PAGO_PROVEEDOR','GASTO',
                     'MANUAL','TRASPASO','REVERSO','CIERRE_CONSOLIDACION'));
```
`mov_caja_fuerte_origen_check` already contains `DEPOSITO_CIERRE` — no change needed there.

## File-by-File Change Map

| File | Change |
|---|---|
| `migrations/0077_cierre_consolidacion_tesoreria.sql` | New — CHECK fixes above |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Add `consolidarMetodoATesoreriaEnTx`; refactor `crearTraspasoSesionATesoreria` into thin wrapper |
| `src/features/contabilidad/hooks/use-gastos.ts` | Add `insertarGastoComisionEnTx` |
| `src/features/contabilidad/schemas/cuentas-config-schema.ts` | Add `COMISION_BANCARIA` to `CLAVES_CONFIG` |
| `src/features/caja/hooks/use-sesiones-caja.ts` | `cerrarSesionCaja` gains steps 8-9 |
| `src/features/caja/components/sesion-caja-form.tsx` | Remove "recuerda depositar" toast |
| `src/features/tesoreria/components/movimientos-table.tsx`, `reverso-modal.tsx`, `src/features/bancos/components/conciliacion-bancaria.tsx` | Add `CIERRE_CONSOLIDACION` label/color entries |
| `src/core/db/kysely/types.ts` | Update `origen` comment for new value |

## Verification (no test runner)

`yarn type-check` + `yarn lint` must pass. Manual checklist: close a session mixing EFECTIVO USD, EFECTIVO Bs, and a commission-bearing PUNTO method → confirm `mov_caja_fuerte` rows (`origen='DEPOSITO_CIERRE'`, `validado=0`), `movimientos_bancarios` INGRESO (`origen='CIERRE_CONSOLIDACION'`, `validado=0`) and EGRESO (`origen='GASTO'`), one `gastos` row against `COMISION_BANCARIA`'s account with correct Bs/USD/tasa, and `traspasos_tesoreria` rows tagged `sesion_caja_id`. Then close a session using a method with no destino configured → confirm the whole cierre throws, session stays `ABIERTA`, and no orphan rows exist. Confirm the toast no longer renders.

## Rollout Note

Estimated diff likely exceeds the 400-line review budget once the commission path is included. Natural split for `sdd-tasks`: **PR #1** = migration 0077 + `consolidarMetodoATesoreriaEnTx` + `insertarGastoComisionEnTx` + `COMISION_BANCARIA` clave (helpers only, unused). **PR #2** = `cerrarSesionCaja` wiring (steps 8-9) + toast removal + label dictionaries.

## Open Questions

None — all three items flagged in the proposal are resolved above.
