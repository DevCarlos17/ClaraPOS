# Proposal: Excluir métodos `deposito_directo=1` de la consolidación de cierre

## Intent

`cerrarSesionCaja` (`src/features/caja/hooks/use-sesiones-caja.ts`) consolida a tesorería TODOS los métodos bancarios de la sesión sin distinguir `metodos_cobro.deposito_directo`. Para métodos directos, la venta (`use-ventas.ts:1542-1611`) ya postea el INGRESO bancario en el momento del pago. El cierre repite esa escritura vía `consolidarMetodoATesoreriaEnTx`, duplicando filas `movimientos_bancarios` e inflando `bancos_empresa.saldo_actual` 2x — viola la regla de negocio de saldos consistentes y precisión bimonetaria. Esta pieza ("Cambio C" — exclusión) fue diseñada y documentada como pendiente en `openspec/comisiones-consolidacion-cierre/archive-report.md` pero nunca se implementó; el spec vigente `tesoreria-consolidacion-cierre` la lista explícitamente en su sección "Out of Scope" (L152) como diferida.

## Scope

### In Scope
- Agregar `mc.deposito_directo` al SELECT de `metodosConfigResult` en `cerrarSesionCaja` (~L1022-1029).
- Extraer un predicado puro `debeExcluirseDeConsolidacionCierre(config: { deposito_directo: number }): boolean` (nuevo archivo o junto a `deducciones-cierre.ts`, mismo patrón), con test unitario Vitest siguiendo el precedente `deducciones-cierre.test.ts`.
- Aplicar el predicado dentro del loop de consolidación (~L1071+), antes de resolver `destino`/llamar `consolidarMetodoATesoreriaEnTx`, con `continue` para saltar el método completo (incluye su rama de deducciones — comportamiento pre-existente, no regresión).
- No tocar `consolidarMetodoATesoreriaEnTx` (función compartida con el traspaso manual POS→Tesorería) ni `use-ventas.ts` (ruta de venta ya correcta).

### Out of Scope
- **Reconciliación de datos históricos**: sesiones ya cerradas en producción con pagos `deposito_directo=1` tienen HOY filas `movimientos_bancarios` duplicadas y `bancos_empresa.saldo_actual` inflado 2x. Corregir esos datos es una migración destructiva sobre registros financieros que colisiona con la regla de inmutabilidad #2 del proyecto, requiere su propio análisis de riesgo/rollback y autorización explícita del negocio. Se registra como dependencia de seguimiento conocida, NO se entrega en este cambio.
- Posteo de deducción (comisión bancaria/ISLR) en el momento de venta para métodos directos ("Cambio C" parte 1) — sigue sin implementarse; excluir el método del loop de cierre también salta su deducción, pero esto ya era así antes de este fix (nadie reportó comisiones faltantes en directos), no es una regresión introducida aquí.
- Los 2 issues MINOR de la exploración previa (obs #2522: decimal en label POS, decimal IGTF USD) — módulos no relacionados.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tesoreria-consolidacion-cierre`: el requirement de consolidación automática de cierre debe excluir métodos con `deposito_directo=1` del loop de INGRESO a tesorería (ya listado como diferido en el spec actual, L152 "Out of Scope" — este cambio lo mueve de diferido a implementado).

## Approach

1. Ampliar el SELECT existente de `metodosConfigResult` para incluir `mc.deposito_directo` (columna ya existe en DB, migración `0069_bancos_metodos_pago_v2.sql`, sin cambio de schema necesario).
2. Extraer el predicado puro `debeExcluirseDeConsolidacionCierre(config)` → `config.deposito_directo === 1`. Función testeable sin I/O, siguiendo el patrón ya usado por `resolverDeduccionesCierre` en `deducciones-cierre.ts`.
3. Dentro del `for` de consolidación, justo después de resolver `config` por método (antes de la rama EFECTIVO/bancaria), aplicar `if (debeExcluirseDeConsolidacionCierre(config)) continue`.
4. Tests unitarios Vitest para el predicado (casos: `deposito_directo=1` → true, `=0` → true/false según semántica, valores no bancarios). `cerrarSesionCaja` en sí queda sin test directo (ya es así hoy — función de integración con `db.writeTransaction`, fuera del alcance de Vitest puro).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | SELECT de `metodosConfigResult` + filtro `continue` en loop de consolidación |
| `src/features/caja/lib/deducciones-cierre.ts` (o archivo nuevo hermano) | Modified/New | Predicado puro `debeExcluirseDeConsolidacionCierre` |
| `src/features/caja/lib/__tests__/*.test.ts` | New | Tests unitarios del predicado |
| `openspec/specs/tesoreria-consolidacion-cierre/spec.md` | Modified (delta) | Mover el ítem L152 de "Out of Scope" a requirement implementado |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Saltar deducciones (comisión/ISLR) para métodos directos en cierre | Low | Comportamiento pre-existente documentado, no regresión de este cambio; queda anotado en el spec como deuda conocida ("Cambio C" parte 1 pendiente) |
| Regresión en el traspaso manual POS→Tesorería | Low | `consolidarMetodoATesoreriaEnTx` no se modifica; el filtro ocurre antes de invocarla, en el único call site de cierre |
| Datos históricos ya duplicados no se corrigen con este fix | Medium (negocio) | Explícitamente fuera de alcance; registrado como dependencia de seguimiento para autorización y diseño separado |

## Rollback Plan

Revertir el commit del predicado + filtro en `use-sesiones-caja.ts` (single PR, diff acotado). No hay migración de schema ni cambio de datos — revert de código puro restaura el comportamiento previo (con el bug de duplicación) sin riesgo de pérdida de datos.

## Dependencies

- **Follow-up conocido (fuera de alcance)**: script/migración de reconciliación para sesiones ya cerradas con `movimientos_bancarios` duplicados y `bancos_empresa.saldo_actual` inflado 2x. Requiere autorización de negocio y diseño de riesgo/rollback propio antes de programarse.

## Success Criteria

- [ ] Un pago con método `deposito_directo=1` en una sesión de caja genera exactamente UNA fila `movimientos_bancarios` INGRESO (en venta) y CERO filas adicionales al cerrar la sesión.
- [ ] `bancos_empresa.saldo_actual` refleja el monto correcto (1x, no 2x) tras el cierre.
- [ ] Métodos bancarios con `deposito_directo=0` (por lote) siguen consolidándose al cierre sin cambios de comportamiento.
- [ ] Test unitario del predicado `debeExcluirseDeConsolidacionCierre` pasa en `yarn test:run`.
- [ ] `yarn type-check` y `yarn type-check:test` sin errores.
- [ ] Diff total del PR < 400 líneas (forecast: ~15-30 líneas + tests).
