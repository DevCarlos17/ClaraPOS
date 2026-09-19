# Proposal: NC "Devolver Dinero" vía Tesorería (REFUND_TESORERIA)

## Intent

`REFUND_TESORERIA` es la última modalidad de liquidación de NC sin implementar — hoy `crearNotaCredito` la rechaza con un `throw` explícito antes de abrir transacción. Este change la implementa: permitir que una Nota de Crédito (ruta Admin/Tradicional) reintegre dinero real desde banco o caja fuerte, total o parcialmente, dejando el remanente no reembolsado como saldo a favor (SAFC).

## Scope

### In Scope
- Habilitar botón "Devolver dinero" → sub-opción "Tesorería" en `crear-ncr-modal.tsx` (solo entry point `TRADICIONAL`)
- Selector de cuenta(s) banco/caja fuerte con saldo visible (`useCuentasTesoreria()`)
- Monto ingresado en la MONEDA de la cuenta elegida; conversión a USD vía `notas_credito.tasa_historica` (nunca tasa vigente)
- Cálculo en vivo de "pendiente por reembolsar"
- Refund total cubre 100% de la NC; parcial deja el resto como SAFC (misma rama SAFC ya existente)
- Tope duro: no reembolsar más que el monto de la NC (validación cliente + servidor)
- Arquitectura multi-fuente: `egresoParams` como ARRAY desde el día 1 (UI puede exponer solo 1 cuenta ahora, sin bloquear extensión futura)
- Migración nueva: valor de `origen` en CHECK constraint de `movimientos_bancarios` y `mov_caja_fuerte`

### Out of Scope
- Sub-opción "Sesión de caja activa" (permanece deshabilitada; la forma de datos debe permitir agregarla después)
- Regla de sobregiro bancario (por usuario o por cuenta) — política futura de tesorería; bancos siguen sin guard como hoy
- "Excedente como nueva CxC" (reembolso > NC registrado como deuda nueva) — futuro
- `nota-credito-pos-modal.tsx` (POS-express) — `REFUND_TESORERIA` sigue excluida ahí

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `notas-credito-liquidacion`: el requisito `REFUND_TESORERIA` pasa de placeholder condicional a comportamiento completo (multi-cuenta, conversión a tasa histórica, tope + composición con SAFC, escritura en tesorería)
- `notas-credito-admin`: `crear-ncr-modal.tsx` gana el flujo real "Devolver dinero" → Tesorería, explícitamente diferido en `spec.md` (línea 7: "comportamiento real de Devolver dinero... diferido a un change futuro")

## Approach

Perfil de reuso validado (`delta-refund-vs-saf.md`): **~70% reuso puro** (emisión, `tasa_historica`, kardex/stock, Step A cancela deuda, whitelist anti-fraude, `useCuentasTesoreria()`). **~20% extensión** (Step B se parte: egreso real de tesorería + remanente reusa LITERAL el bloque SAFC existente; templates de egreso de `use-cxp.ts`/`use-traspasos.ts`). **~10% nuevo**: (1) migración `origen` CHECK — sin esto el primer INSERT real falla contra Postgres; (2) `egresoParams` pasa de objeto único a ARRAY (gotcha: `[]` es truthy — el gate anti-fraude necesita `.length > 0` explícito); (3) tope no-exceder-NC; (4) mini-formulario UI, tamaño comparable al de PARCIAL. Principio de diseño clave: **tesorería no sabe qué es una NC** — el flujo de NC escribe un egreso genérico con `doc_origen_id`/`doc_origen_tipo`, sin lógica NC-específica dentro de los módulos de tesorería.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/0093_*.sql` (tentativo) | New | Agrega valor a `origen` CHECK en `movimientos_bancarios` y `mov_caja_fuerte` |
| `src/features/ventas/hooks/use-notas-credito.ts` | Modified | Quita el `throw`; nueva rama Step B; `EgresoCajaParams`→array; fix gotcha del gate |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modified | Sub-opción Tesorería, account-picker, cálculo en vivo, validación de tope |
| `src/features/ventas/utils/notas-credito-fiscal.ts` (o hermano nuevo) | New/Modified | Funciones puras: conversión a tasa histórica, guard saldo-suficiente, cálculo de remanente |
| `use-notas-credito.test.ts`, `crear-ncr-modal.test.tsx` | Modified | Reemplaza el test RED placeholder; nueva cobertura bajo TDD estricto |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migración `origen` CHECK no aplicada antes de `apply` → primer INSERT real falla contra Postgres | High | Migración como primera tarea de `sdd-tasks`; test que fuerza el INSERT antes de escribir lógica de negocio |
| Gotcha `[]` truthy en `assertGateAntiFraudeNoDesembolso` bypassea el guard anti-desembolso silenciosamente | Medium | `.length > 0` explícito + test dedicado |
| Partir Step B rompe alguna de las 4 modalidades ya probadas (~35 tests existentes) | Medium | Suite completa de regresión antes/después de cada cambio, TDD estricto (`yarn test:run`) |
| Sobregiro bancario sigue sin guard (inconsistente con política futura) | Low | Fuera de alcance explícito; documentado para change futuro de tesorería |

**Forecast de tamaño (Review Workload Guard)**: probablemente **EXCEDE el presupuesto de 400 líneas** (migración + rama de motor + refactor de array + mini-formulario UI + tests bajo TDD estricto). No se decide split aquí — `sdd-tasks` debe forecastear PRs encadenados/stacked explícitamente.

## Rollback Plan

Revertir migración 0093 (restaurar CHECK anterior sin el nuevo valor de `origen`) y revertir el código de `use-notas-credito.ts`/`crear-ncr-modal.tsx`. `REFUND_TESORERIA` vuelve al `throw` de bloqueo. Sin pérdida de datos: los egresos de tesorería son un código nuevo, no tocan escrituras existentes de las otras 4 modalidades.

## Dependencies

- TDD estricto activo (`yarn test:run`) — cada función pura nueva y cada rama nueva requiere test RED antes de implementación
- `useCuentasTesoreria()`, templates de egreso (`use-cxp.ts`, `use-traspasos.ts`), `notas_credito.tasa_historica` (ya persistida) — todos ya en producción

## Open Design Forks (para `sdd-design`, NO decididos aquí)

a) Forma exacta de `egresoParams` (array) · b) valor de `doc_origen_tipo` · c) nombre del valor nuevo en `origen` CHECK · d) orden de reparto entre N cuentas · e) dónde vive el cálculo puro (conversión + tope + pendiente) · f) número final de migración (0093 tentativo)

## Success Criteria

- [ ] Refund total y parcial vía `REFUND_TESORERIA` escriben egreso de tesorería + remanente SAFC correctamente
- [ ] Imposible reembolsar más que el total de la NC (cliente + servidor)
- [ ] Las 4 modalidades existentes siguen pasando su suite de regresión sin cambios
- [ ] Migración 0093 aplicada; ambos CHECK (`movimientos_bancarios`, `mov_caja_fuerte`) aceptan el nuevo valor de `origen`
