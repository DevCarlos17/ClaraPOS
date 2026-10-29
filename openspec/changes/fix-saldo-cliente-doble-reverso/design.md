# Design: Fix doble-conteo de saldo_actual en reversos CxC repetidos

## Technical Approach

Tres capas independientes, ninguna depende de orden de deploy de las otras:

1. **App (TS)**: `reversarPagoEnTx` deja de usar el `monto` crudo del `pago` para reabrir la deuda del CLIENTE — usa el **delta REAL que la venta absorbió** (ya clampeado por el techo existente `Decimal.min(totalFactura, saldoPend+monto)`). Así el cliente nunca puede subir más de lo que la factura subió.
2. **DB (reconciliación)**: migración que corrige, SOLO para clientes con drift detectado, `saldo_pendiente_usd` y `saldo_actual` aplicando el **mismo delta** de corrección a ambas columnas (nunca recalcula `saldo_actual` desde cero — ver Decision 3).
3. **DB (assertion)**: `actualizar_saldo_cliente()` gana una validación de consistencia interna para `REV`, defensa en profundidad — NO re-valida el bug de clamp (eso es responsabilidad de la capa 1), detecta errores de wiring futuros (omitir `saldo_nuevo`, igual que ya hace para `SAF`).

## Architecture Decisions

| Decisión | Elegido | Alternativas descartadas | Razón |
|---|---|---|---|
| D1. Techo cliente | Usar `ventaDeltaReal = nuevoSaldoFactura - saldoPendActual` (0 ≤ delta ≤ monto) como incremento del cliente, en vez de `montoUsd` crudo | (a) Clampear contra `totalFactura` directo — incorrecto, un cliente tiene N facturas, no 1. (b) Clampear contra `SUM(ventas.saldo_pend_usd)` leído en vivo — reintroduce el SUM correlacionado que 0110 eliminó por performance (fuera de alcance, ver proposal) | `ventaDeltaReal` es lo único que la venta realmente absorbió; sumar eso garantiza cliente y Σventas en lockstep SIEMPRE, sin leer nada extra (cero queries nuevas) |
| D2. Guard monto=0 | Si `ventaDeltaReal ≤ 0`: NO insertar `movimientos_cuenta` (violaría `CHECK monto>0`), NO tocar `clientes`. `pagos.is_reversed=1` sigue marcándose | Insertar monto=0.0001 "simbólico" | El reverso es un verdadero no-op económico (retry/race sobre una venta ya restaurada); mismo patrón ya usado en `registrarAbonoGlobal` (`hayMontoAplicadoFacturas`) |
| D3. Qué columna reconciliar | Aplicar el **mismo delta** de corrección a `saldo_pendiente_usd` Y `saldo_actual` | Recalcular `saldo_actual` desde `SUM(ventas.saldo_pend_usd)` igual que `saldo_pendiente_usd` | `saldo_actual` neteа deuda+SAF; recalcularlo desde ventas solamente rompería clientes con crédito SAF legítimo. El bug (`REV` sin clamp) sube AMBAS columnas por el MISMO monto crudo — el delta de corrección es idéntico en ambas por construcción. Mismo principio que 0062 ("no tocar SAF, solo corregir deuda") |
| D4. Alcance reconciliación | Solo clientes con `ABS(real − cache) > 0.005` (no todos) | Recalcular todos los clientes | Ya decidido por el owner; evita reescrituras masivas innecesarias, preserva auditoría de `updated_at` |
| D5. Assertion REV | `ABS((saldo_nuevo − saldo_anterior) − monto) > 0.005 → RAISE` (dirección fija `+`, a diferencia de SAF que es ambigua) | No agregar assertion (status quo) | Mirror exacto del patrón SAF (0110/0114/0115); nunca falsea porque los 3 write-sites (directo, fan-in global, SAF-reversal en `reversa-pago-saf.ts`) ya escriben `saldo_nuevo = saldo_anterior + monto` por construcción — ver prueba abajo |

### Prueba de no-falso-positivo (D5)
- **Directo**: `saldoNuevo = saldoActual.plus(ventaDeltaReal)`, `monto = ventaDeltaReal` → igualdad exacta.
- **Global fan-in** (N llamadas a `reversarPagoEnTx` en el loop de `reversarAbonoDirectoDesdeTesoreria`): cada llamada lee el `clientes` YA actualizado por la anterior (misma tx) y aplica su propio delta → cada fila individual cumple la igualdad; el incremento total del cliente = Σ `ventaDeltaReal_i` (exactamente lo pedido).
- **SAF-reversal** (`reversarPagoSafEnTx`, no tocado por este change): ya escribe `monto = montoAplicadoUsd` (desde `saf_creditos_aplicaciones`, inmutable) y `saldo_nuevo = saldoAnterior.plus(montoAplicadoUsd)` — satisface la igualdad sin cambios.
- La assertion NO detecta el bug original (el código viejo también era internamente consistente: `monto=montoUsd crudo`, `saldo_nuevo=saldoActual+montoUsd` → igualdad se cumplía). Es ortogonal: defiende contra bugs de wiring futuros, no sustituye el fix de capa 1.

## Data Flow

```
reversarPagoEnTx(tx, pagoId)
  Step 3 (venta):  saldoPendActual --clamp min(total,+monto)--> nuevoSaldoFactura
                    ventaDeltaReal = nuevoSaldoFactura - saldoPendActual   [0..monto]
  Step 4 (cliente): if ventaDeltaReal <= 0 -> SKIP (no mov, no UPDATE clientes)
                     else -> clientes += ventaDeltaReal ; INSERT REV(monto=ventaDeltaReal)
```

## File Changes

| File | Action | Descripción |
|---|---|---|
| `src/features/cxc/hooks/use-cxc.ts` (`reversarPagoEnTx`, ~L1977-2033) | Modify | Captura `ventaDeltaReal` en Step 3; Step 4 usa ese delta (no `montoUsd`) para `saldoActual`, `calcularSaldoPendienteClienteNuevo`, y `monto` del INSERT; guard `<= 0` |
| `src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts` | Modify | Casos de Test Strategy abajo |
| `migrations/0118_reconciliar_saldo_cliente_y_assertion_rev.sql` | Create | Reconciliación (D3/D4) + `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` con assertion REV (D5), en una sola migración (ninguna depende de la otra en orden) |

## Interfaces / Contracts

```sql
-- Reconciliación (idempotente, usa el mecanismo OFICIAL de bypass — no viola
-- la regla de inmutabilidad, usa el mismo canal que el trigger):
PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
WITH real AS (
  SELECT v.cliente_id, v.empresa_id, SUM(CAST(v.saldo_pend_usd AS NUMERIC)) AS deuda_real
  FROM ventas v WHERE v.status != 'ANULADA' GROUP BY v.cliente_id, v.empresa_id
), drift AS (
  SELECT c.id, COALESCE(r.deuda_real,0) - CAST(c.saldo_pendiente_usd AS NUMERIC) AS delta
  FROM clientes c LEFT JOIN real r ON r.cliente_id=c.id AND r.empresa_id=c.empresa_id
  WHERE ABS(COALESCE(r.deuda_real,0) - CAST(c.saldo_pendiente_usd AS NUMERIC)) > 0.005
)
UPDATE clientes c SET
  saldo_pendiente_usd = CAST(c.saldo_pendiente_usd AS NUMERIC) + d.delta,
  saldo_actual         = CAST(c.saldo_actual AS NUMERIC) + d.delta,
  updated_at = NOW()
FROM drift d WHERE d.id = c.id;
-- GET DIAGNOSTICS + RAISE NOTICE con el count de filas corregidas.
```

```sql
-- Trigger, nueva rama (junto a FAC/NDB/SAF, antes de REV/SAL/SAFC/SAFR sin cambio):
ELSIF NEW.tipo = 'REV' THEN
  IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
    RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
      NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
  END IF;
```

Tolerancia `0.005` = ruido de redondeo NUMERIC(20,8) (mismo valor que la assertion SAF y el repair 0062) — **distinta** de la decisión "tolerancia 0" (#5453), que es sobre cuándo una factura cuenta como "pagada" para filtros de lectura, no sobre esta guarda de consistencia interna de escritura.

## Testing Strategy

| Caso | Setup | Assert |
|---|---|---|
| TC1 Retry/race (core) | Venta total=$1, `saldo_pend_usd` YA en $1 (simula reverso duplicado previo); pago monto_usd=$1 | `ventaDeltaReal=0` → sin INSERT, cliente sin cambios |
| TC2 Repro 4 pasos (no-regresión) | abono$1→reverso→abono$1→reverso, camino normal | Factura y cliente ambos terminan en $1 |
| TC3 Reverso directo simple | Sin drift | Delta = monto (comportamiento idéntico al actual) |
| TC4 Fan-in global | 2 facturas, 1 con drift (delta=0), 1 sin drift (delta=30) | Incremento total del cliente = 30, NUNCA 70 |
| TC5 SAF-reversal intacto | `generatedLote=true` | Rama nueva NUNCA se ejecuta; delega 100% a `reversarPagoSafEnTx` sin cambios |
| TC6 Reconciliación idempotente | Cliente con drift seed | 1ra corrida corrige; 2da corrida: 0 filas afectadas |
| TC7 Assertion rechaza/pasa | INSERT manual REV con `saldo_nuevo` mal vs bien | Mal → `RAISE EXCEPTION P0001`; bien → OK |

TC1-TC5: Vitest sobre `reversarPagoEnTx` (mock de `tx`, patrón ya usado en `reversar-pago-en-tx.test.ts`). TC6-TC7: bloques `BEGIN;...ROLLBACK;` manuales dentro del propio archivo de migración (no hay infra de tests contra Postgres en este repo — mismo patrón que 0110/0115).

## Migration / Rollout

Migración `0118` (siguiente libre tras `0117`). Reconciliación y assertion van en el MISMO archivo: la reconciliación hace `UPDATE` directo sobre `clientes` (nunca pasa por el trigger de `movimientos_cuenta`), así que el orden interno entre ambas partes no afecta corrección. El fix de capa 1 (TS) es igualmente independiente de deploy-order: la assertion nueva es ortoognal al bug de clamp (ver prueba D5) — es seguro aplicar `0118` antes, después, o junto al PR de `use-cxc.ts`. Recomendado: mismo PR/release para cerrar la clase de bug completa de una vez.

## Open Questions

- [ ] Causa raíz exacta del stale-read/race (migration 0096) — **fuera de alcance**, follow-up aparte (owner decision #3). Este fix hace el síntoma NO-PERSISTIBLE aunque la carrera siga ocurriendo.
- [ ] `useClientesConDeuda` sigue leyendo el cache (no SUM en vivo) — aceptado (revertir 0110 está fuera de alcance); la reconciliación + el clamp cierran el drift sin tocar ese read-path.
