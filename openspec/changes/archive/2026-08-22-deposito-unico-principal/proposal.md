# Proposal: Depósito Único Forzado como Principal

## Intent

`es_principal` en `depositos` solo tiene invariantes at-most-one/at-least-one (TS puro, sin trigger Postgres). Ninguna cubre crear el único depósito sin marcarlo `es_principal`, dejando el kardex (`resolveDepositoIngreso`/`Egreso`, `LIMIT 1` sin `ORDER BY`) sin destino determinístico. Se agrega esa tercera invariante en 3 capas.

## Scope

### In Scope
- Función pura `debeForzarPrincipalUnico` en `deposito-principal.ts`, hermana de `buildUnsetOtrosPrincipalesQuery`/`debeBloquearQuitarUltimoPrincipal`.
- Pre-check fail-fast en `crearDeposito`/`actualizarDeposito`, mismo patrón que at-least-one.
- Checkbox `es_principal` disabled + forced `checked` con 1 depósito activo; `deposito-list.tsx` pasa el count como prop (sin query nueva).
- `migrations/0086_*.sql`: 2 triggers Postgres (`BEFORE INSERT`/`UPDATE`), patrón `validate_venta_*` — **rechazan**, no corrigen `NEW`.
- Tests unitarios (strict TDD).

### Out of Scope
- UX de reconciliación al rechazo del trigger sobre escritura local ya aplicada (sync-rollback) — **diferido a `design.md`**.
- `powersync-sync-rules.yaml`, schema Zod de depósitos.
- Auto-corrección silenciosa de `NEW` (ningún trigger existente muta).

## Capabilities

### New Capabilities
- `deposito-principal-unico`: invariante "único depósito activo debe ser principal" en UI + hook + trigger DB.

### Modified Capabilities
- None. (Sin spec previo de `depositos`.)

## Approach

**Invariante (bloqueada)**: "único" = un solo depósito con `is_active=1`, consistente con `debeBloquearQuitarUltimoPrincipal` y los resolvers de kardex.

3 capas, defensa en profundidad:
1. **UI** (UX only): `debeForzarPrincipalUnico` bloquea+marca el checkbox.
2. **Hook**: mismo cálculo, fail-fast antes de `writeTransaction`.
3. **DB** (fuente de verdad real): trigger cuenta activos, rechaza con `RAISE EXCEPTION`; PowerSync descarta el 23xxx sin reintentar.

## Affected Areas

| Area | Impact |
|------|--------|
| `lib/deposito-principal.ts` (+test) | +`debeForzarPrincipalUnico` |
| `hooks/use-depositos.ts` (+test) | Pre-check crear/actualizar |
| `components/depositos/deposito-form.tsx` | Prop count + disable/forced-checked |
| `components/depositos/deposito-list.tsx` | Pasa depósitos activos como prop |
| `migrations/0086_deposito_unico_principal.sql` | New: triggers Postgres |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Divergencia local/servidor: trigger rechaza escritura optimista offline | Low | UI/hook bloquean el flujo normal antes; caso raro abierto en `design.md` |
| Inconsistencia de definición (total vs activos) | Low | Resuelta acá (activos); función pura compartida |
| Trigger rompe creación del primer depósito en producción | Med | Rechaza solo cuando UI/hook ya lo garantizan |

## Rollback Plan

Trigger: `DROP TRIGGER` + `DROP FUNCTION` en migración de reversión. Capas TS: revert de un commit (aditivo).

## Dependencies

- Exploración `sdd/deposito-unico-principal/explore` (obs #2165) — invariante (activos) confirmado.

## Success Criteria

- [ ] Empresa con 1 depósito activo sin `es_principal=1` imposible en las 3 capas.
- [ ] Checkbox bloqueado+marcado con 1 activo; libre con 2+.
- [ ] Trigger rechaza (no auto-corrige) intentos vía consola/API directa.
- [ ] `yarn test:run`, `yarn type-check:test`, `yarn type-check` pasan.
- [ ] Diff ~190-215 líneas, bajo budget de 400.
