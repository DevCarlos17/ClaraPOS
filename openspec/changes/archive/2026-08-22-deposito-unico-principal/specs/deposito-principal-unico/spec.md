# Deposito Principal Unico Specification

## Purpose

Close the gap where an empresa's single active depósito can exist without `es_principal=1`, leaving `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` (`LIMIT 1` sin `ORDER BY`) without a deterministic kardex target. Enforced in 3 layers: UI (UX only), hook (fail-fast), DB trigger (source of truth, reject-only).

## Requirements

### Requirement: Invariante "Depósito Activo Único Debe Ser Principal"

When an empresa has exactly one depósito with `is_active=1`, that depósito MUST have `es_principal=1`. The Postgres `BEFORE INSERT`/`UPDATE` trigger is the source of truth and MUST reject (via `RAISE EXCEPTION`, no auto-correcting `NEW`) any write violating this. UI and hook are earlier layers preventing the violation before it reaches the DB.

#### Scenario: Primer depósito de la empresa

- GIVEN an empresa with zero depósitos
- WHEN the owner creates the first one
- THEN the UI checkbox is disabled+checked, the hook writes `es_principal=1` without user input, and the INSERT succeeds
- AND IF a raw INSERT bypassing UI/hook attempts `es_principal=0` for this first depósito, the trigger rejects it

#### Scenario: Segundo depósito de la empresa

- GIVEN an empresa with 1 active depósito (`es_principal=1`)
- WHEN the owner creates a second depósito
- THEN the single-active lock no longer applies: UI leaves the checkbox free, and only the existing at-most-one guard (`buildUnsetOtrosPrincipalesQuery`) governs `es_principal`

#### Scenario: Desactivar depósitos hasta quedar uno activo

- GIVEN an empresa deactivating depósitos down to exactly 1 remaining active
- WHEN the last deactivation is applied
- THEN the remaining depósito MUST already be `es_principal=1` (existing at-least-one guard blocks any path leaving it `es_principal=0`)
- AND the DB trigger independently confirms the resulting row is valid

#### Scenario: Intento de desmarcar `es_principal` en el único activo

- GIVEN an empresa with exactly 1 active depósito, currently `es_principal=1`
- WHEN a user attempts to set `es_principal=0` on it (UI or direct hook call)
- THEN the hook rejects fail-fast before `writeTransaction` (same condition as `debeBloquearQuitarUltimoPrincipal`)
- AND IF the hook is bypassed, the UPDATE trigger rejects it via `RAISE EXCEPTION`

#### Scenario: Escritura cruda "ni vía consola"

- GIVEN an empresa with exactly 1 active depósito
- WHEN a raw SQL write (bypassing UI and hook) attempts to leave it `is_active=1 AND es_principal=0`, directly or by deactivating siblings
- THEN the Postgres trigger rejects the write; no violating row ever persists

### Requirement: Checkbox `es_principal` Bloqueado y Forzado en el Formulario

`deposito-form.tsx` MUST disable and force-check `es_principal` when the empresa has exactly 1 active depósito (via prop from `deposito-list.tsx`, no new query), and leave it freely editable with 2+ active depósitos.

#### Scenario: Formulario con un único depósito activo

- GIVEN the empresa has exactly 1 active depósito
- WHEN `deposito-form.tsx` renders (create or edit)
- THEN the `es_principal` checkbox is disabled and checked, and cannot be unchecked by the user

#### Scenario: Formulario con dos o más depósitos activos

- GIVEN the empresa has 2+ active depósitos
- WHEN `deposito-form.tsx` renders
- THEN the `es_principal` checkbox is enabled and reflects the depósito's current value, unaffected by this invariant

### Requirement: Consistencia con Guards At-Most-One / At-Least-One

`debeForzarPrincipalUnico` MUST NOT contradict `buildUnsetOtrosPrincipalesQuery` (at-most-one) or `debeBloquearQuitarUltimoPrincipal` (at-least-one). All three MUST agree on the same outcome whenever their conditions overlap.

#### Scenario: Marcar otro depósito como principal no rompe el invariante

- GIVEN an empresa with 2+ active depósitos
- WHEN the owner marks a different depósito as `es_principal`
- THEN `buildUnsetOtrosPrincipalesQuery` unsets the previous principal atomically in the same transaction, and `debeForzarPrincipalUnico` does not apply (count of active > 1)

#### Scenario: At-least-one y el nuevo invariante coinciden en el caso límite

- GIVEN an empresa with exactly 1 active depósito, `es_principal=1`
- WHEN the owner attempts to remove its principal status
- THEN `debeBloquearQuitarUltimoPrincipal` already blocks it in the hook, and `debeForzarPrincipalUnico`/the DB trigger reject the same operation as defense in depth — never a conflicting verdict
