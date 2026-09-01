# Design: Depósito Único Forzado como Principal

## Technical Approach

Mirror the existing at-most-one (`buildUnsetOtrosPrincipalesQuery`) / at-least-one (`debeBloquearQuitarUltimoPrincipal`) pattern with a third pure function, `debeForzarPrincipalUnico`, applied in the same 3 layers: UI checkbox lock, hook fail-fast pre-check, and a new Postgres trigger pair (INSERT + UPDATE) mirroring `validate_venta_insert`/`validate_venta_update` (`migrations/0001_initial_schema.sql:438-503`). Per discovery obs #2198, the real gap is only at CREATE of the first depósito; the UPDATE trigger is pure defense-in-depth and stays simple (reject-only, no extra flow logic).

## Architecture Decisions

### Decision: Sync-rollback UX for trigger rejection

**Choice**: No new rollback machinery. The existing generic `uploadFailed` mechanism (`connector.ts` `FATAL_RESPONSE_CODES` already includes `P0001`, `__root.tsx` already renders a toast: *"El servidor rechazó el registro por una regla de negocio..."*) covers this trigger automatically, with zero new code.
**Alternatives considered**: (a) Custom local-state reconciliation that detects the rejected depósito and reverts the optimistic UI row; (b) a dedicated toast message for this specific trigger.
**Rationale**: UI (disabled+checked checkbox) and hook (fail-fast throw before `writeTransaction`) already make the trigger **unreachable in normal operation** — it only fires on raw SQL/API writes bypassing the app. Building reconciliation UX for a path only reachable via console access is dead code the maintainer would have to maintain forever. The generic handler already tells the user "rejected, business rule, ask a supervisor" and never retries (P0001 is in `FATAL_RESPONSE_CODES`, so `uploadRetryStore.clear()` + `transaction.complete()` run immediately — no infinite retry loop). **Documented consequence**: if a raw write ever violates this invariant, the row exists in local SQLite but is discarded server-side; the local copy diverges until manually corrected — same known tradeoff as every other `IMMUTABLE_TABLES`/trigger-guarded table in this codebase.

### Decision: Trigger scope — INSERT vs UPDATE effort

**Choice**: Both triggers exist (parity with the `validate_venta_*` precedent and the spec's "ni vía consola" requirement), but UPDATE stays a flat reject check — no attempt to model "which sibling was deactivated" or similar flow logic.
**Alternatives considered**: Skip the UPDATE trigger entirely (relying only on the hook's `debeBloquearQuitarUltimoPrincipal`) since obs #2198 confirms the normal flow can never reach the violating state via UPDATE.
**Rationale**: Proposal explicitly requires a `BEFORE UPDATE` trigger for defense-in-depth against raw writes deactivating siblings (spec scenario "Escritura cruda"). Skipping it would leave that scenario unenforced at the DB layer, which is the declared source of truth.

## Data Flow

    deposito-list.tsx (activeCount from useDepositosActivos)
         │ prop: activeDepositosCount
         ▼
    deposito-form.tsx ──(count===1)──► checkbox disabled+checked
         │ submit
         ▼
    crearDeposito / actualizarDeposito (use-depositos.ts)
         │ debeForzarPrincipalUnico(count, es_principal) → throw before writeTransaction
         ▼
    db.writeTransaction → INSERT/UPDATE depositos
         │ PowerSync sync (optimistic local commit already visible to user)
         ▼
    Supabase Postgres: trg_deposito_forzar_principal_insert / _update
         │ RAISE EXCEPTION (only reachable if UI+hook bypassed)
         ▼
    connector.ts uploadData catch → P0001 in FATAL_RESPONSE_CODES → uploadFailed event
         ▼
    __root.tsx toast: "rechazado por regla de negocio" (existing, no new code)

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/inventario/lib/deposito-principal.ts` | Modify | Add `debeForzarPrincipalUnico(activeDepositosCount, esPrincipal): boolean` |
| `src/features/inventario/lib/__tests__/deposito-principal.test.ts` | Modify | Unit tests for the new function (strict TDD, written first) |
| `src/features/inventario/hooks/use-depositos.ts` | Modify | `crearDeposito`: default `es_principal=true` fail-fast when count is 0 pre-create and user passed `false`; `actualizarDeposito`: extend existing pre-check block to also call `debeForzarPrincipalUnico` |
| `src/features/inventario/components/depositos/deposito-form.tsx` | Modify | New prop `activeDepositosCount: number`; checkbox `disabled`/`checked` forced when `count === 1` (create) or `count === 1 && deposito.is_active` (edit); Spanish hint text below checkbox |
| `src/features/inventario/components/depositos/deposito-list.tsx` | Modify | Pass `depositos.filter(d => d.is_active === 1).length` as `activeDepositosCount` to `<DepositoForm>` (no new query — reuses `useDepositos()` data already in scope) |
| `migrations/0086_deposito_unico_principal.sql` | Create | `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` for INSERT and UPDATE on `depositos` |

## Interfaces / Contracts

```ts
// deposito-principal.ts
/**
 * Invariante "depósito activo único debe ser principal". Se evalúa ANTES de
 * escribir: `activeDepositosCount` es el conteo de is_active=1 de la empresa
 * SIN contar el depósito que se está creando/actualizando (mismo criterio que
 * `existeOtroPrincipalActivo` en debeBloquearQuitarUltimoPrincipal).
 * Devuelve `true` cuando la operación DEBE bloquearse: quedaría exactamente
 * 1 depósito activo en la empresa y ese depósito NO es_principal.
 */
export function debeForzarPrincipalUnico(params: {
  /** Depósitos activos de OTRAS filas (no cuenta este) que quedarían tras la operación. */
  otrosActivosCount: number
  /** Este depósito quedará activo tras la operación (is_active=1). */
  quedaraActivo: boolean
  /** Este depósito quedará es_principal=false tras la operación. */
  esPrincipalFalse: boolean
}): boolean {
  return params.otrosActivosCount === 0 && params.quedaraActivo && params.esPrincipalFalse
}
```

- `crearDeposito`: `otrosActivosCount` = `COUNT(*) WHERE empresa_id=? AND is_active=1` (pre-read, same pattern as the existing `actualizarDeposito` pre-check); if the check returns `true`, throw `Error('El único depósito activo de la empresa debe ser principal.')` before opening `writeTransaction` — mirrors the existing at-least-one error message style.
- `actualizarDeposito`: extend the existing `podriaQuitarPrincipal` pre-check block — it already fetches `otrosRows` (COUNT excluding `id`); reuse that same query result for `debeForzarPrincipalUnico`.
- `deposito-form.tsx`: `const soloUno = isEditing ? activeDepositosCount === 1 && deposito!.is_active === 1 : activeDepositosCount === 0`; when `soloUno`, force `esPrincipal=true` in the effect and render `disabled` + hint: `"Es el único depósito activo — debe ser el principal."`

## Trigger SQL Shape (migration 0086)

Mirrors `validate_venta_insert`/`validate_venta_update` (function name convention, `RAISE EXCEPTION` message style, `RETURN NEW`) and the idempotent `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` pattern from `0060_fix_saldo_trigger_idempotency.sql`:

```sql
CREATE OR REPLACE FUNCTION validate_deposito_principal_unico()
RETURNS TRIGGER AS $$
DECLARE
  otros_activos INT;
BEGIN
  IF NEW.is_active = TRUE AND NEW.es_principal = FALSE THEN
    SELECT COUNT(*) INTO otros_activos
    FROM depositos
    WHERE empresa_id = NEW.empresa_id
      AND is_active = TRUE
      AND id != NEW.id;

    IF otros_activos = 0 THEN
      RAISE EXCEPTION 'El único depósito activo de la empresa debe ser principal';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deposito_principal_unico_insert ON depositos;
CREATE TRIGGER trg_deposito_principal_unico_insert
  BEFORE INSERT ON depositos
  FOR EACH ROW EXECUTE FUNCTION validate_deposito_principal_unico();

DROP TRIGGER IF EXISTS trg_deposito_principal_unico_update ON depositos;
CREATE TRIGGER trg_deposito_principal_unico_update
  BEFORE UPDATE ON depositos
  FOR EACH ROW EXECUTE FUNCTION validate_deposito_principal_unico();
```

Single shared function for both triggers (same technique as `validate_venta_*` uses two separate functions, but here the INSERT/UPDATE check is identical — `NEW.id != NEW.id` is always false on INSERT before the row exists, so `id != NEW.id` correctly excludes nothing extra and the same COUNT logic works unmodified for both events).

## Interaction with Existing Guards

| Scenario | at-most-one | at-least-one | new invariant | Verdict |
|---|---|---|---|---|
| Create 1st depósito, `es_principal=false` | n/a (nothing to unset) | n/a | blocks | **Blocked by new invariant only** |
| Create 2nd depósito | applies if `es_principal=true` | n/a | count=1 (not 0), does not apply | No conflict |
| Deactivate last active principal | n/a | blocks | would also block (same condition) | Same verdict, hook throws first |
| Unset `es_principal` on the sole active depósito | n/a | blocks | would also block | Same verdict — never contradicting |

No case where the three disagree; the new invariant's condition (`otrosActivosCount === 0`) is a strict subset/superset alignment with `debeBloquearQuitarUltimoPrincipal`'s `!existeOtroPrincipalActivo`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `debeForzarPrincipalUnico` — all boolean combinations | Vitest, no mocks (pure function), written first (strict TDD) |
| Unit | `crearDeposito`/`actualizarDeposito` pre-check throws before `writeTransaction` | Vitest with `db.getAll`/`db.writeTransaction` mocked, asserting no `INSERT`/`UPDATE` executed when blocked |
| Unit | `deposito-form.tsx` checkbox disabled+checked at count 0/1/2+ | React Testing Library render test |
| DB (manual) | Trigger rejects raw INSERT/UPDATE violating the invariant | Not unit-testable in Vitest (real Postgres required) — verified via manual SQL against a Supabase dev branch per migration checklist; documented in migration file header, same convention as other trigger-only migrations (e.g. `0060`) |

## Migration / Rollout

`migrations/0086_deposito_unico_principal.sql`, additive and idempotent (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`). No backfill needed — existing empresas already satisfy the invariant in practice (created via the current UI, which already defaults `es_principal` sensibly for single-depósito empresas per current behavior); the trigger only prevents *future* violations. Rollback: `DROP TRIGGER` + `DROP FUNCTION` in a follow-up migration; TS layers revert via plain commit revert (additive, no schema dependency).

## Open Questions

None — sync-rollback UX resolved above (existing `uploadFailed` handler covers it, no new code).
