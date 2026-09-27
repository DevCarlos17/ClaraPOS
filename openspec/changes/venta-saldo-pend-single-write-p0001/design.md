# Design: Escritura única de `ventas.saldo_pend_usd` en `crearVenta`

## Technical Approach

`cierre` (`calcularCierreVentaConSaf`, hoy L902-914) solo necesita datos que ya existen ANTES del
INSERT: `pagos`/`tasa`/`safEntry`/`discrepancy` (params), `totalUsd` (L409-420) y una lectura de
`movimientos_cuenta` por `cliente_id` (L891-899, ajena a la venta). El bloque completo
—`abonado_BsNativo`/`abonado_UsdNativo` (L883-884), `creditoDisponibleUsd` (L886-899),
`calcularCierreVentaConSaf` y la derivación de `tipoFinal`— se ADELANTA a justo después de
`totalUsd`/`totalBs` (L429), antes de `nro_factura` (L431) y del INSERT (L482). El INSERT escribe
`cierre.saldoPendUsd`/`tipoFinal` en vez de `totalUsd`/`tipo`. Se eliminan el `UPDATE saldo_pend_usd`
(L916-919) y el `UPDATE tipo` condicional (L928-934) del camino normal. Lo que sigue después del
INSERT (pagos, CxC, consumo SAF L983-1031, contabilidad) NO se mueve: sigue leyendo `cierre`/
`saldoPend` como variable local ya calculada, sin alterar el orden de `pos-aplicar-saf-checkout`.

## Architecture Decisions

| # | Decisión | Elegido | Alternativa descartada |
|---|----------|---------|------------------------|
| 1 | Punto de anclaje del hoist | Después de `totalBs` (L429), antes de `nro_factura` (L431) | Antes del INSERT (tras `nro_factura`) — mezclaría lecturas ajenas con la derivación pura de `cierre` |
| 2 | Fórmula de `tipoFinal` | `(mode === 'ABSORBER' \|\| mode === 'DIFERENCIAL_FALTANTE') ? tipo : cierre.tipo` | Copiar el `if` original — equivalente, pero menos legible como valor precomputado |
| 3 | Momento de leer `creditoDisponibleUsd` | Antes del INSERT, misma posición relativa que hoy | Tras el loop de `pagos` — descartada: ese loop nunca toca `movimientos_cuenta` del cliente, sin dependencia real |
| 4 | UPDATE forzado a `'0.00'` en ABSORBER/DIFERENCIAL_FALTANTE (L1167/L1246) | Se **mantiene sin cambios**, fuera de alcance | Fusionarlo en el INSERT (`saldoPendUsdInsert = modo-absorción ? 0 : cierre.saldoPendUsd`) cerraría el 100% de P0001, pero excede `proposal.md` §Scope (solo L916/L933). Ver Open Questions |

**Nota crítica (hallazgo de código, no cubierto por proposal/spec)**: en `ABSORBER`/
`DIFERENCIAL_FALTANTE` el INSERT queda con `cierre.saldoPendUsd` (el faltante) y el switch de
discrepancia (L1163-1248) sigue forzando `UPDATE ventas SET saldo_pend_usd = '0.00'`. Baja de 3
escrituras a 2 — mejora neta — pero no logra "una sola escritura" para estos 2 modos, pese a que
Success Criteria #1 no lista excepción. Estado final en DB idéntico a hoy; lo que no se cierra es la
exposición a replay P0001 de estos 2 modos, preexistente y no agravada por este fix.

## Data Flow

```
ANTES                              DESPUÉS
totalUsd/totalBs                   totalUsd/totalBs
nro_factura                        cierre + tipoFinal  (hoisted)
INSERT (saldo=totalUsd, tipo)      nro_factura
pagos loop                         INSERT (saldo=cierre.saldoPendUsd, tipo=tipoFinal)
cierre + tipoFinal                 pagos loop
UPDATE saldo_pend_usd  ←ELIMINADO  SAF consumo / CxC / contabilidad  (mismo orden)
UPDATE tipo (cond.)    ←ELIMINADO
SAF consumo / CxC / contabilidad
```

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/ventas/hooks/use-ventas.ts` | Modify | Hoist de `cierre`+`tipoFinal` antes del INSERT; eliminar L916-919 y L928-934 |
| `src/features/ventas/hooks/__tests__/use-ventas.test.ts` | Modify | Actualizar asserts existentes (L496-498, 525-538, 560-561) + matriz nueva |

`migrations/0006_ventas.sql` y `connector.ts`: sin cambios (verificado, cero diff).

## Interfaces / Contracts

```ts
// Nueva posición, antes del INSERT (~L429-430 actual):
const abonado_BsNativo = pagos.filter(p => p.moneda === 'BS').reduce(...)
const abonado_UsdNativo = pagos.filter(p => p.moneda === 'USD').reduce(...)
let creditoDisponibleUsd = new Decimal(0)
if (safEntry && safEntry.montoUsd > 0.001) { /* SELECT SUM(SAFC)-SUM(SAF) ... */ }
const cierre = calcularCierreVentaConSaf({ totalUsd, tasa, abonadoBsNativo, abonadoUsdNativo,
  safSolicitadoUsd: safEntry?.montoUsd ?? 0, creditoDisponibleUsd,
  respetarEleccionCredito: discrepancy?.mode === 'CREDITO' })
const tipoFinal = (discrepancy?.mode === 'ABSORBER' || discrepancy?.mode === 'DIFERENCIAL_FALTANTE')
  ? tipo : cierre.tipo

// INSERT (L483-508): col. saldo_pend_usd = cierre.saldoPendUsd, col. tipo = tipoFinal.
// saldoPend/safAplicadoUsd/safFueCapeadoResult siguen usándose sin cambios después (L983+).
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | 100% contado, 100% crédito, mixto, SAF aplicado | Extender `mockCrearVentaTx`; assert UN `INSERT INTO ventas` con `saldo_pend_usd`/`tipo` finales, CERO `UPDATE` posterior de ambos |
| Regression | ABSORBER/DIFERENCIAL_FALTANTE (tests L503-562) | `saldoUpdates` pasa a `toHaveLength(1)` (antes 2), valor final `'0.00'`; `tipoUpdates` sigue `toHaveLength(0)` |
| Regression | SAF (test L456-499) | `ventaSaldoUpdates` de `toHaveLength(1)` a `toHaveLength(0)`; validar `saldo_pend_usd` en params del INSERT |
| Idempotencia | INSERT lleva el saldo final | Nuevo test: params del INSERT == `cierre.saldoPendUsd` esperado (replay reenviaría el mismo valor, `NEW == OLD`) |
| Invariante | Orden SAF (`pos-aplicar-saf-checkout`) | Confirmar que `INSERT movimientos_cuenta tipo='SAF'` sigue después del INSERT de `ventas` en `calls` |

Estimado: ~90-110 líneas en `use-ventas.ts` (mover ~30 + tocar ~15), ~120-160 en el test. Total
~250-300 líneas, dentro del budget de 400. `migrations/0006_ventas.sql`/`connector.ts`: 0 líneas.

## Migration / Rollout

Sin migración de datos ni schema. Revertir el commit restaura el doble-write actual (mismo Rollback
Plan del proposal).

## Open Questions

- [ ] Decisión 4: exposición residual a P0001 en `ABSORBER`/`DIFERENCIAL_FALTANTE` (el UPDATE forzado
      a `'0.00'` sigue siendo una segunda escritura post-INSERT) — ¿se acepta fuera de alcance de este
      PR (per `proposal.md` §Scope) o requiere change de seguimiento? Necesita decisión de owner, no
      bloquea el resto del fix.
