# Design: Excluir métodos `deposito_directo=1` de la consolidación de cierre

## Technical Approach

Fix puntual de un filtro faltante ("Cambio C" pendiente, ver proposal/spec). Se extrae un predicado puro `debeExcluirseDeConsolidacionCierre` y se aplica dentro del loop de consolidación existente en `cerrarSesionCaja`, con `continue`, ANTES de resolver `destino` o llamar `consolidarMetodoATesoreriaEnTx`. No se toca ninguna función compartida ni el flujo de venta (`use-ventas.ts`, ya correcto).

## Architecture Decisions

### Decisión: Ubicación del predicado — archivo hermano nuevo, no `deducciones-cierre.ts`

**Choice**: Nuevo archivo `src/features/caja/lib/consolidacion-cierre.ts` (mismo directorio, mismo patrón: función pura, sin I/O, sin `tx`).
**Alternatives considered**: Agregar la función dentro de `deducciones-cierre.ts` (sugerido como opción B en el proposal).
**Rationale**: `deducciones-cierre.ts` está tematizado específicamente para cálculo de comisión/ISLR (`resolverDeduccionesCierre`, `construirNroGastoDeduccion`). La exclusión por `deposito_directo` es una decisión de ROUTING, no de deducción — mezclar ambas responsabilidades en un archivo degrada cohesión sin ganar nada (no comparten tipos ni lógica). Mismo patrón de test (`__tests__/*.test.ts`) se reutiliza sin fricción.

### Decisión: Punto de corte con `continue`, después de validar `config`

**Choice**: Insertar el check justo después de `if (!config) { throw ... }` (línea 1077) y antes de `const nombreMetodo = config.nombre` (línea 1078), usando `if (debeExcluirseDeConsolidacionCierre(config)) continue`.
**Alternatives considered**: Filtrar `metodosParaConsolidarBase` antes del batch SELECT (Approach 2 del explore, obs #2526).
**Rationale**: `config` ya está resuelto y tipado en ese punto (single batch SELECT ya trajo todos los métodos); filtrar ahí es O(1) por método, no requiere una query adicional ni reordenar el pipeline existente (`metodoIdsSoloLotes` depende del orden actual de `metodosParaConsolidarBase`). El `continue` salta correctamente TODO el resto del bloque por método: resolución de `destino`, `aplicarComisionSiCorresponde` (ambas ramas lotes/sin-lotes) y las llamadas a `consolidarMetodoATesoreriaEnTx`.

### Decisión: `deposito_directo` se agrega al SELECT existente, sin query nueva

**Choice**: Ampliar `metodosConfigResult` (L1022-1029) con `mc.deposito_directo` y el tipo `MetodoConfigRow` con `deposito_directo: number`.
**Alternatives considered**: SELECT separado solo para el flag.
**Rationale**: Columna ya existe en `metodos_cobro` (schema PowerSync `src/core/db/powersync/schema.ts:196`, `column.integer` — boolean 0/1), confirmado sin necesidad de migración. Es la misma tabla/join ya usado; agregar una columna al SELECT existente es zero-cost.

## Data Flow

```
cerrarSesionCaja (tx)
  └─ metodosConfigResult SELECT (+ mc.deposito_directo)
       └─ for [metodoCobroId, totalSistemaD] of metodosParaConsolidar:
            config = metodosConfigMap.get(metodoCobroId)
            ├─ if !config → throw (sin cambios)
            ├─ if debeExcluirseDeConsolidacionCierre(config) → continue  ◄── NUEVO
            │     (método deposito_directo=1: ya posteado en use-ventas.ts,
            │      se salta destino/deducciones/consolidarMetodoATesoreriaEnTx)
            └─ resto del loop sin cambios (destino, deducciones, consolidarMetodoATesoreriaEnTx)
```

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/caja/lib/consolidacion-cierre.ts` | Create | Predicado puro `debeExcluirseDeConsolidacionCierre(config)` + tipo `MetodoConsolidacionConfig` |
| `src/features/caja/lib/__tests__/consolidacion-cierre.test.ts` | Create | Tests Vitest del predicado (TDD RED→GREEN) |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modify | Import del predicado; SELECT `metodosConfigResult` (~L1022-1029) agrega `mc.deposito_directo`; tipo `MetodoConfigRow` (~L1031-1040) agrega `deposito_directo: number`; `continue` en el loop (~L1077-1078) |

## Interfaces / Contracts

```typescript
// src/features/caja/lib/consolidacion-cierre.ts
export interface MetodoConsolidacionConfig {
  /** PowerSync boolean 0/1. 1 = liquida directo al banco en cada venta (ya posteado). */
  deposito_directo: number
}

/**
 * Determina si un metodo de cobro debe excluirse del loop de consolidacion
 * automatica del cierre porque su INGRESO bancario ya fue posteado en el
 * momento de la venta (use-ventas.ts:1542-1611). Funcion PURA: sin I/O, sin tx.
 */
export function debeExcluirseDeConsolidacionCierre(
  config: MetodoConsolidacionConfig
): boolean {
  return config.deposito_directo === 1
}
```

Integración en `use-sesiones-caja.ts` (L1072-1078 actual → nuevo):
```typescript
const config = metodosConfigMap.get(metodoCobroId)
if (!config) {
  throw new Error(`No se encontro la configuracion del metodo de cobro para consolidar el cierre de caja.`)
}
if (debeExcluirseDeConsolidacionCierre(config)) continue
const nombreMetodo = config.nombre
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `debeExcluirseDeConsolidacionCierre` | Vitest puro, sin mocks. Casos: `{ deposito_directo: 1 }` → `true`; `{ deposito_directo: 0 }` → `false`. Sigue precedente `deducciones-cierre.test.ts` (`describe`/`it`, sin PowerSync). |
| Integration | `cerrarSesionCaja` (loop completo) | Fuera de alcance de Vitest puro hoy (requiere mock pesado de `db.writeTransaction`/PowerSync) — mismo estado que antes del fix, no se agrega cobertura nueva aquí. Verificación manual/QA vía escenarios del spec (obs #2534): pago directo → 1 sola fila `movimientos_bancarios`; pago por-lote → sigue consolidando igual que hoy. |

**TDD**: RED — escribir `consolidacion-cierre.test.ts` importando `debeExcluirseDeConsolidacionCierre` desde un archivo que aún no existe (falla en type-check/import). GREEN — crear `consolidacion-cierre.ts` con la implementación mínima. Verificar con `yarn type-check:test` y `yarn test:run`.

## Migration / Rollout

No migration required. Columna `deposito_directo` ya existe (migración `0069_bancos_metodos_pago_v2.sql`, confirmada en `schema.ts:196`). Rollback = revert del commit único; no hay cambio de datos ni de schema.

## Changed-Lines Forecast (review workload guard)

| Item | Est. lines |
|------|-----------|
| `consolidacion-cierre.ts` (new) | ~15 |
| `consolidacion-cierre.test.ts` (new) | ~25 |
| `use-sesiones-caja.ts` (import + SELECT + type + continue) | ~8 |
| **Total** | **~48** |

`Decision needed before apply: No` · `Chained PRs recommended: No` · `400-line budget risk: Low`

## Open Questions

None — root cause, fix location, and column existence all confirmed by exploration (obs #2526) and this design.
