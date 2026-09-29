# Design: Permitir reverso de abono en ventas (fix P0001 en CxC)

## Technical Approach

Relajar `prevent_venta_mutation()` (trigger vivo en `migrations/0006_ventas.sql:195-230`) para que `saldo_pend_usd` pueda SUBIR, pero solo hasta `total_usd` (nunca mas alla de la deuda original). Todos los demas guards de la funcion quedan byte-identicos. Es un cambio de una sola condicion SQL en una `CREATE OR REPLACE FUNCTION`, sin tocar `use-cxc.ts` (la logica JS ya acota con `Decimal.min(totalFactura, saldoPendActual.plus(montoUsd))`, linea 1565). Se confirmo por `grep` que **ningun** UPDATE en el codigo toca `ventas.total_usd` (solo `saldo_pend_usd` y, en un caso de NC, `status`) — el trigger ya bloquea cualquier cambio a `total_usd` en su primer guard, asi que `NEW.total_usd` es siempre igual a `OLD.total_usd` en el punto donde se evalua el nuevo bound.

## Architecture Decisions

| Decision | Opcion elegida | Alternativa descartada | Razon |
|---|---|---|---|
| Regla de relajacion | `NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd` → bloquear | Quitar el guard por completo | Permite subir el saldo (reverso) pero nunca inflar mas alla de la factura original; preserva la defensa contra manipulacion |
| Ubicacion del bound | Solo en el trigger (UPDATE-time) | CHECK constraint a nivel de tabla | Un CHECK nuevo valida TODAS las filas existentes de `ventas` en prod al crearse (`ALTER TABLE ... ADD CONSTRAINT`), sin staging para confirmar que ninguna fila historica ya lo viola — riesgo de bloqueo/fallo en tabla financiera viva. El trigger solo dispara en el UPDATE que nos importa (la reversa), sin tocar INSERT ni datos existentes |
| Bound superior | `<= total_usd` (no un valor fijo) | Sin bound (blanket allow) | `total_usd` es inmutable por el mismo trigger, asi que es un techo estable y ya validado por el guard anterior de la funcion |
| NC/ND interaccion | Ninguna — fuera de alcance | Considerar cascada de NC sobre total_usd | NC/ND viven en tablas propias (`notas_credito`); no hay ningun UPDATE que cambie `ventas.total_usd`, confirmado via grep en `src/` |

## Data Flow

    registrarReversoAbono (use-cxc.ts:1504)
        │  Decimal.min(total_usd, saldo_pend_usd + monto)  ← ya acotado en JS
        ▼
    UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?
        │
        ▼
    trg_venta_protect → prevent_venta_mutation()
        │  saldo sube pero <= total_usd → ACEPTA (antes: rechazaba con P0001)
        │  saldo sube y > total_usd     → RAISE EXCEPTION (defensa en profundidad, sin cambio de comportamiento util)
        │  saldo baja o igual           → ACEPTA (sin cambio, comportamiento original)
        ▼
    PowerSync sync → Supabase (ya no descarta el batch como FATAL)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0097_permitir_reverso_saldo_venta.sql` | Create | `CREATE OR REPLACE FUNCTION prevent_venta_mutation()` — solo cambia el guard de `saldo_pend_usd`, resto verbatim de 0006 |
| `src/features/cxc/hooks/__tests__/use-cxc.test.ts` | Modify | Agrega `describe('registrarReversoAbono ...')` cubriendo el UPDATE acotado a `total_usd` |
| `src/features/cxc/hooks/use-cxc.ts` | None | Sin cambio de codigo — `Decimal.min` ya existe |

## Interfaces / Contracts

Migracion (aplicar manualmente via Supabase SQL Editor, no hay runner de CI):

```sql
-- migrations/0097_permitir_reverso_saldo_venta.sql
-- Fix: registrarReversoAbono (use-cxc.ts:1504) hace UPDATE ventas SET
-- saldo_pend_usd = min(total_usd, saldo+monto) para reabrir la deuda tras
-- reversar un pago, pero el guard original solo permitia que saldo_pend_usd
-- BAJARA. Se relaja para permitir que suba, acotado a total_usd (nunca mas
-- alla de la deuda original de la factura). Resto del guard sin cambios.
CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  IF NEW.nro_factura IS DISTINCT FROM OLD.nro_factura
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
     OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
     OR NEW.tasa IS DISTINCT FROM OLD.tasa
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.deposito_id IS DISTINCT FROM OLD.deposito_id
     OR NEW.total_exento_usd IS DISTINCT FROM OLD.total_exento_usd
     OR NEW.total_base_usd IS DISTINCT FROM OLD.total_base_usd
     OR NEW.total_iva_usd IS DISTINCT FROM OLD.total_iva_usd
     OR NEW.total_igtf_usd IS DISTINCT FROM OLD.total_igtf_usd THEN
    RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd y status de una venta';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd puede bajar libremente; puede SUBIR (reverso de pago)
  -- solo hasta total_usd — nunca mas alla de la deuda original (fix 0097).
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Vitest) | `registrarReversoAbono`: el UPDATE de `saldo_pend_usd` queda acotado a `total_usd`, usa el mismo `mockTx`/`beforeEach` que el resto de `use-cxc.test.ts` | `yarn test:run` — mockear `pagos`/`ventas`/`clientes`/`monedas`/`libro_contable` SELECTs; assert `UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?` con `params[0] === toStorageString(Decimal.min(total, saldo+monto))` en 2 casos: reverso parcial (resultado < total_usd) y reverso que satura al total (resultado === total_usd) |
| Trigger (SQL, no testeable en Vitest) | Los 4 casos del guard: reverso valido, reverso que excede total_usd, mutacion de campo inmutable, DELETE | Manual, Supabase SQL Editor, produccion — script abajo, envuelto en `BEGIN; ... ROLLBACK;` para no dejar datos de prueba |
| Types | Sin cambios de tipos | `yarn type-check` |

Script de verificacion manual (Supabase SQL Editor, self-contained, usa datos existentes, hace ROLLBACK):

```sql
BEGIN;
DO $$
DECLARE
  v_empresa_id UUID; v_cliente_id UUID; v_deposito_id UUID; v_usuario_id UUID; v_venta_id UUID;
BEGIN
  SELECT id INTO v_empresa_id FROM empresas LIMIT 1;
  SELECT id INTO v_cliente_id FROM clientes WHERE empresa_id = v_empresa_id LIMIT 1;
  SELECT id INTO v_deposito_id FROM depositos WHERE empresa_id = v_empresa_id LIMIT 1;
  SELECT id INTO v_usuario_id FROM usuarios WHERE empresa_id = v_empresa_id LIMIT 1;

  INSERT INTO ventas (empresa_id, cliente_id, nro_factura, deposito_id, tasa, total_usd, total_bs, saldo_pend_usd, tipo, usuario_id)
  VALUES (v_empresa_id, v_cliente_id, 'TEST-TRG-0097', v_deposito_id, 40, 100.00000000, 4000.00000000, 0.00000000, 'CREDITO', v_usuario_id)
  RETURNING id INTO v_venta_id;

  UPDATE ventas SET saldo_pend_usd = 100.00000000 WHERE id = v_venta_id; -- Caso 1: reverso hasta total_usd -> debe pasar
  RAISE NOTICE 'Caso 1 OK';

  BEGIN
    UPDATE ventas SET saldo_pend_usd = 150.00000000 WHERE id = v_venta_id; -- Caso 2: excede total_usd -> debe fallar
    RAISE EXCEPTION 'FALLO: se permitio saldo > total_usd';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no puede exceder el total%' THEN RAISE NOTICE 'Caso 2 OK: %', SQLERRM; ELSE RAISE; END IF;
  END;

  BEGIN
    UPDATE ventas SET nro_factura = 'HACKED' WHERE id = v_venta_id; -- Caso 3: campo inmutable -> debe fallar
    RAISE EXCEPTION 'FALLO: se permitio mutar nro_factura';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Solo se puede actualizar saldo_pend_usd%' THEN RAISE NOTICE 'Caso 3 OK: %', SQLERRM; ELSE RAISE; END IF;
  END;

  BEGIN
    DELETE FROM ventas WHERE id = v_venta_id; -- Caso 4: DELETE -> debe fallar
    RAISE EXCEPTION 'FALLO: se permitio DELETE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no se pueden eliminar%' THEN RAISE NOTICE 'Caso 4 OK: %', SQLERRM; ELSE RAISE; END IF;
  END;
END $$;
ROLLBACK; -- no deja rastro en produccion
```

## Migration / Rollout

Aplicar `0097` manualmente en Supabase SQL Editor (sin runner de CI, igual que el resto de la serie). Rollback (`0098_revert_permitir_reverso_saldo_venta.sql`, solo si algo sale mal) — paste-back exacto de la funcion original de `0006_ventas.sql:195-227` (mismo `CREATE OR REPLACE FUNCTION`, guard `IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN RAISE EXCEPTION 'El saldo pendiente solo puede disminuir'; END IF;`), sin cambios de datos — reversible sin perdida.

Trabajo de un solo PR (single-pr, sin chaining): `0097_permitir_reverso_saldo_venta.sql` (~50 lineas) + test nuevo en `use-cxc.test.ts` (~40-60 lineas) — total muy por debajo del budget de 400 lineas.

## Open Questions

- [ ] Ninguna — alcance y regla de negocio confirmados en la fase de propuesta (Resolucion Q1).
