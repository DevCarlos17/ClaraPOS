# Design: Validación de excedente y distribución de vuelto en Cobro POS

## Technical Approach

Approach 1 de la exploración/propuesta: gating puro en `cobro-modal.tsx` (sin nuevo estado, reutiliza `splitVuelto`/`vueltoMontoBs`) + extensión de `case 'VUELTO'` en `crearVenta` (`use-ventas.ts`) que bookea el delta reutilizando, vía helpers extraídos, el INSERT exacto de `DIFERENCIAL_SOBRANTE`/`DIFERENCIAL_FALTANTE`. Cero schema, cero migración, `use-cuadre.ts` sin cambios (ya lee esas primitivas).

## Architecture Decisions

### Decision: Quitar auto-selección sin romper el reset de modos obsoletos

**Choice**: En el `useEffect` de `pendienteBs4` (L246-286), rama `pendienteBs4.lt('-0.01')`: quitar `discrepancyMode === null` de la condición y cambiar `setDiscrepancyMode('VUELTO')` → `setDiscrepancyMode(null)`.
**Alternativas**: Borrar todo el bloque `if (pendienteBs4.lt('-0.01'))`.
**Rationale**: Si se borra el bloque entero, un `discrepancyMode` stale (`CREDITO`/`ABSORBER`/`DIFERENCIAL_SOBRANTE`/`DIFERENCIAL_FALTANTE` dejado por una transición faltante→excedente) sobreviviría y podría activar lógica de otra rama. Resetear a `null` (no a `VUELTO`) limpia el estado inválido SIN pre-seleccionar nada. Como efecto directo, `puedeProcesar` cae al `return false` final de la rama `estaOverpago` (L363) cuando `discrepancyMode===null` — **requisito #2 queda resuelto sin tocar `puedeProcesar`**.

### Decision: `splitVueltoValid` = distribución no-vacía, sin cap de sobre-distribución

**Choice**: `const splitVueltoValid = splitVueltoSumBs.gt(0)` (reemplaza el `length===0 || exceso.lte(umbral)` actual).
**Alternativas**: Mantener el cap de sobre-distribución (`splitVueltoExceso.lte(umbralBs.plus('0.01'))`) como tope de validez.
**Rationale**: La propuesta es explícita: "mensaje dispara ante diferencia ≠ 0" — sin epsilon de negocio fijado por el owner. El cap viejo bloqueaba Procesar si se asignaba de más; ahora CUALQUIER delta (bajo o sobre) se bookea como sobrante/faltante vía la Decision de wiring, así que el cap pierde sentido y se elimina. `splitVueltoExceso` (ya existente, `=splitVueltoSumBs.minus(vueltoMontoBs)`) se **reutiliza sin renombrar** como el delta de la Decision siguiente.
**Gate final**: `if (discrepancyMode === 'VUELTO') return pagos.length > 0 && splitVueltoValid && safEstado === 'ok'` (AND-gate `safEstado` de engram #5293 preservado intacto).
**Guard de defensa en `handleProcesar` (L479)**: cambia a `if (discrepancyMode === 'VUELTO' && !splitVueltoValid) { toast.error('Debés distribuir el vuelto entre al menos un método antes de procesar'); return }` (quita `splitVuelto.length > 0 &&`, porque ahora vacío ya es inválido).

### Decision: Delta en Bs, signo y epsilon de higiene flotante

**Choice**: `delta = splitVueltoExceso` (Bs, Decimal). `delta.lt(0)` → **SOBRANTE** de `delta.abs()` Bs (distribuido < ideal, queda plata en caja). `delta.gt(0)` → **FALTANTE** de `delta` Bs (distribuido > ideal, se entregó de más). Umbral de "sin diferencia" = `delta.abs().lte('0.005')` Bs — **solo** higiene de redondeo flotante (media unidad del display de 2 decimales), **no** es el `umbralBs` (`tasa*0.01`) usado en otras ramas de diferencial-cambiario, que sí representa un umbral de negocio y no debe reutilizarse aquí (el owner pidió "sin epsilon fijo").
**Moneda**: Bs — `vueltoMontoBs` y `splitVueltoSumBs` ya están en Bs (los montos USD de métodos efectivo se convierten a Bs al escribirse en `splitVuelto`, L1069). Para el helper de FALTANTE (que persiste en USD, ver abajo) se convierte una sola vez con `bsToUsd(delta, tasaUsada)` a precisión completa.

### Decision: Mensaje inline, no bloqueante

**Choice**: Reemplaza el bloque de estado "✓ Correcto / Sin asignar / Dif. cambio / Excede" (L1086-1109) por 3 estados: `delta` ≈0 → "✓ Correcto" (verde); `delta<0` → `Diferencia: {formatBs(|delta|)} — se registrará como sobrante de caja` (ámbar); `delta>0` → `Diferencia: {formatBs(delta)} — se registrará como faltante de caja` (naranja). Se renderiza debajo de la lista de inputs de split, dentro del bloque `discrepancyMode === 'VUELTO'` (L1046-1111). Nunca afecta `puedeProcesar`.

### Decision: Wiring a `crearVenta` — extender `case 'VUELTO'`, no un modo nuevo

**Choice (a, recomendada)**: Nuevo campo opcional en `DiscrepancyOptions`: `vueltoDeltaBs?: number` (negativo=sobrante, positivo=faltante, `undefined` si no hay delta relevante). El modal lo calcula en `handleProcesar` SOLO cuando `discrepancyMode==='VUELTO'` y `delta.abs().gt('0.005')`. Dentro de `case 'VUELTO'` en `crearVenta` (L1544-1591), **después** de insertar los EGRESOs de `vueltoEntries` (sin tocar ese código), si `discrepancy.vueltoDeltaBs !== undefined`: `deltaBsDec.lt(0)` → llamar al mismo INSERT que hoy usa `case 'DIFERENCIAL_SOBRANTE'`; `deltaBsDec.gt(0)` → llamar al mismo INSERT que hoy usa `case 'DIFERENCIAL_FALTANTE'`.
**Alternativas**: (b) exigir que el cajero elija un discrepancyMode separado `DIFERENCIAL_SOBRANTE`/`FALTANTE` tras VUELTO — rechazada: rompe el flujo de 1 solo clic en Procesar y el modelo de "un solo discrepancyMode por venta".
**Rationale/mecánica de reuso**: extraer el cuerpo de `case 'DIFERENCIAL_SOBRANTE'` (L1513-1542) a `insertDiferencialSobranteMovimiento(tx, { empresa_id, montoBs, ventaId, nroFactura, metodoId, sesion_caja_id, now, usuario_id })` y el de `case 'DIFERENCIAL_FALTANTE'` (L1412-1479) a `insertDiferencialFaltanteGasto(tx, { empresa_id, montoUsd, ventaId, nroFactura, tasa, sesion_caja_id, now, usuario_id, cajeroId })`. Ambos cases existentes pasan a invocar su helper (sin cambiar su comportamiento ni sus params actuales); `case 'VUELTO'` invoca el helper que corresponda al signo del delta. `metodoId` para el helper SOBRANTE resuelve igual que hoy (`vueltoEntries?.[0]?.metodoCobro_id ?? ...`) — en la llamada desde VUELTO, `vueltoEntries` YA está poblado, así que no hace falta lógica nueva. Atomicidad: ambos INSERTs (EGRESO vuelto + diferencial) quedan dentro del mismo `tx` de `db.writeTransaction` (crearVenta ya envuelve TODO el switch desde L311) — sin cambio estructural, gratis. Colisión de `nroGastoDiff` (`POS-DIFF-${ventaId...}`): imposible, `discrepancy.mode` es un único valor — nunca se ejecutan ambos cases para la misma venta.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `cobro-modal.tsx` | Modify | Quitar auto-select (L246-286→reset a `null`); `splitVueltoValid`=`sumBs.gt(0)`; mensaje sobrante/faltante inline; `vueltoDeltaBs` en `handleProcesar`; guard L479 actualizado |
| `use-ventas.ts` | Modify | Nuevo campo `vueltoDeltaBs?` en `DiscrepancyOptions`; extraer 2 helpers `insertDiferencialSobranteMovimiento`/`insertDiferencialFaltanteGasto`; `case 'VUELTO'` los invoca según signo |
| `cobro-modal.test.tsx` | Modify | 8 casos nuevos (gating + mensaje + regresión AND-gate) |
| `use-ventas.test.ts` | Modify | 4 casos nuevos (booking sobrante/faltante desde VUELTO + regresión sin-cuenta) |

## Interfaces / Contracts

```ts
export interface DiscrepancyOptions {
  // ...sin cambios...
  /** VUELTO: delta Bs entre distribuido y excedente ideal. <0 sobrante, >0 faltante. */
  vueltoDeltaBs?: number
}
```

## Testing Strategy

| Layer | What to test | Approach |
|-------|-------------|----------|
| `cobro-modal.test.tsx` | Sin pre-selección (VUELTO/SAF/PROPINA); Procesar bloqueado con split vacío; habilitado con 1 entry >0 aunque no matchee; mensaje sobrante cuando distribuido<ideal; mensaje faltante cuando distribuido>ideal; sin mensaje si exacto; regresión AND-gate `safEstado` | RED primero, `yarn test:run` |
| `use-ventas.test.ts` | `case VUELTO` + `vueltoDeltaBs<0` inserta `movimientos_metodo_cobro INGRESO/DIFERENCIAL_CAMBIARIO`; `+` inserta `gastos/DIFERENCIAL_CAMBIARIO_FALTANTE`; sin `vueltoDeltaBs` no inserta fila extra; sin cuenta configurada rechaza (reusa fixture del test "sin-cuenta" existente en el nuevo call-site) | Mocks de `tx.execute` ya existentes; agregar respuesta de `SELECT cuenta_contable_id FROM cuentas_config` a los fixtures VUELTO que ejerciten la rama faltante |

## Migration / Rollout

No migration required.

## Open Questions

None — alcance y firma cerrados por la propuesta aprobada.
