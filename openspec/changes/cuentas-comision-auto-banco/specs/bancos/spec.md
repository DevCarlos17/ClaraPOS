# Delta for Bancos

> No existing `openspec/specs/bancos/spec.md` — first spec written for this domain.
> Scope limited to `crearCuentasDelBanco` (auto-creation of bank commission accounts).

## ADDED Requirements

### Requirement: Direct Lookup for Commission Parent Groups

`crearCuentasDelBanco` MUST resolve the parent commission groups
(`GRUPO_COMISIONES_BANCARIAS`, `GRUPO_COMISIONES_PASARELA` from `cuentas_config`)
via a direct, synchronous-at-call-time database lookup scoped by `empresaId`
(same imperative `db.execute` pattern used by the principal-account branch).
The function MUST NOT read these groups from a reactive PowerSync hook value
captured by closure.

#### Scenario: Group resolved immediately after app load

- GIVEN the app has just loaded and PowerSync's reactive queries for commission
  groups have not yet resolved
- WHEN the user creates a bank with commission accounts set to auto-create
- THEN the parent group lookup still resolves correctly via direct query
- AND is not affected by reactive query timing

#### Scenario: Lookup scoped to caller's empresa

- GIVEN two empresas each with their own `GRUPO_COMISIONES_BANCARIAS` config row
- WHEN `crearCuentasDelBanco` resolves the group for a bank in empresa A
- THEN the resolved group belongs to empresa A only
- AND empresa B's group is never returned, regardless of which resolves first

---

### Requirement: Deterministic Creation of All Bank Accounts

When a bank is saved with commission-account fields left on "se creara
automaticamente", `crearCuentasDelBanco` MUST create and link both
`cuenta_gasto_comision_id` and `cuenta_gasto_pasarela_id`, in addition to the
principal account, deterministically — independent of PowerSync sync state at
the moment of creation.

#### Scenario: New bank creates all three accounts

- GIVEN a new bank form with principal, commission-bancaria, and
  commission-pasarela all set to auto-create
- AND the parent commission groups exist and are active in `cuentas_config`
  for the current empresa
- WHEN the bank is saved
- THEN `cuenta_id`, `cuenta_gasto_comision_id`, and `cuenta_gasto_pasarela_id`
  are all created and linked (none is `NULL`)

#### Scenario: Applies to all three shared entry points

- GIVEN the create-bank flow, the edit-bank flow, and the manual "Crear
  Cuenta" button all invoke `crearCuentasDelBanco`
- WHEN any of the three triggers a missing commission account with auto-create
  selected
- THEN that entry point creates the missing commission account using the same
  direct-lookup resolution (no entry point keeps the old reactive-hook path)

---

### Requirement: Visible Failure on Unresolvable Commission Group

If a parent commission group cannot be resolved (missing or inactive
`cuentas_config` key for the empresa), `crearCuentasDelBanco` MUST raise an
explicit, non-dismissable error instead of silently skipping the account and
showing a dismissable `toast.warning`. The corresponding commission FK MUST
NOT be silently persisted as `NULL` without the user being informed of the
failure.

#### Scenario: Missing config key surfaces a hard error

- GIVEN `cuentas_config` has no active `GRUPO_COMISIONES_BANCARIAS` entry for
  the empresa
- WHEN a bank is saved with the commission-bancaria account set to
  auto-create
- THEN the system raises an explicit error visible to the user
- AND the error clearly identifies which commission account could not be
  created
- AND this MUST NOT be a dismissable `toast.warning` that lets the flow
  continue unnoticed

---

## MODIFIED Requirements

### Requirement: Principal Account Creation Is Unaffected

The principal bank account creation branch in `crearCuentasDelBanco` MUST
continue to use its existing direct `db.execute` lookup pattern, unchanged by
the commission-account fix.
(Previously: no formal requirement existed; documented here as a regression
guard for this change.)

#### Scenario: Principal account still created via direct execute

- GIVEN a new bank with the principal account set to auto-create
- WHEN the bank is saved
- THEN the principal account is created via the same direct `db.execute` path
  as before this change
- AND its behavior is not altered by the commission-account resolution fix
