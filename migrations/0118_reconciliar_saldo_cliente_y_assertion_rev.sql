-- =============================================================================
-- Migration: 0118_reconciliar_saldo_cliente_y_assertion_rev.sql
-- Created:   2026-10-30
-- Depends:   0117_movimientos_bancarios_pagos.sql (ultima migracion aplicada)
--            0115_add_safv_tipo_movimientos_cuenta.sql (cuerpo base vigente de
--              actualizar_saldo_cliente() — es la MAS RECIENTE CREATE OR
--              REPLACE de esta funcion, confirmado por grep sobre
--              migrations/: ningun archivo posterior a 0115 la redefine.
--              Extender el cuerpo de 0110/0114 en vez de este seria una
--              REGRESION: borraria silenciosamente el tratamiento SAFV
--              agregado en 0115.)
--            feat/fix-saldo-cliente-clamp (PR #284, YA MERGEADO a develop,
--              Unit A del mismo cambio — fix de app en reversarPagoEnTx,
--              use-cxc.ts: frena el sangrado hacia adelante. Esta migracion
--              es Unit B: corrige el drift YA ACUMULADO por el bug antes del
--              fix de app + agrega una asercion de defensa en profundidad.
--              Deploy-order independiente entre ambas unidades — ver diseno,
--              openspec/changes/fix-saldo-cliente-doble-reverso/design.md,
--              seccion "Migration / Rollout".)
--
-- BUG (sintoma reproducido por el owner, cliente test 6): abono $1 -> reverso
--   -> abono $1 -> reverso en la MISMA factura ($1 total) dejaba
--   `clientes.saldo_pendiente_usd`/`saldo_actual` en $2 en vez de $1. Causa
--   raiz: `reversarPagoEnTx` (use-cxc.ts, ANTES del fix de Unit A) reabria la
--   deuda del CLIENTE con el `monto` CRUDO del pago, no con el delta REAL
--   que la factura absorbio (`nuevoSaldoFactura - saldoPendActual`, ya
--   clampeado contra el total de la factura). Si la factura ya estaba al
--   tope (reverso repetido / reintento de PowerSync), el cliente subia de
--   mas aunque la factura no pudiera subir mas. El fix de app (Unit A) hace
--   el sintoma NO-PERSISTIBLE hacia adelante — esta migracion limpia el
--   drift que YA quedo grabado en produccion antes de ese fix.
--
-- FIX (dos partes, mismo archivo, diseno completo en design.md #D1-D5):
--
--   PARTE 1 — Reconciliacion (D3/D4): por (empresa_id, cliente_id), compara
--     la deuda REAL (`SUM(ventas.saldo_pend_usd) WHERE status != 'ANULADA'`)
--     contra el cache (`clientes.saldo_pendiente_usd`). Solo clientes con
--     drift `> 0.005` (decision D4 del owner — no se toca a todos, solo a
--     los realmente corruptos) reciben una correccion: el MISMO delta se
--     aplica a AMBAS `saldo_pendiente_usd` Y `saldo_actual` (D3 — NO se
--     recalcula `saldo_actual` desde SUM(ventas), porque esa columna netea
--     deuda+SAF y recalcularla desde cero romperia creditos SAF legitimos;
--     el bug subio ambas columnas por el MISMO monto crudo, por lo que el
--     delta de correccion es identico en ambas por construccion — mismo
--     principio que la migracion 0062). Usa el canal OFICIAL de bypass
--     `set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)` — el
--     MISMO mecanismo que usa el propio trigger `actualizar_saldo_cliente()`
--     para poder escribir `clientes` — NO viola la regla de inmutabilidad:
--     esta migracion NUNCA inserta, actualiza ni borra `movimientos_cuenta`
--     (tabla inmutable, sin cambios de forma ni de datos aqui), solo hace un
--     UPDATE directo sobre `clientes` autorizado por el mismo canal legitimo
--     que ya usan 0061/0062/0089 para reparaciones de datos.
--
--   PARTE 2 — Asercion REV (D5, defensa en profundidad): agrega una rama
--     `ELSIF NEW.tipo = 'REV'` en `actualizar_saldo_cliente()`, mirror EXACTO
--     del patron ya existente para SAF/SAFV (0110/0114/0115), pero con
--     direccion FIJA (+) en vez de ambigua (+/-): para tipo REV,
--     `saldo_nuevo` SIEMPRE debe ser `saldo_anterior + monto` dentro de
--     tolerancia 0.005 (reverso de abono SIEMPRE reabre deuda, nunca la
--     reduce). Si no coincide, `RAISE EXCEPTION ... ERRCODE = 'P0001'`
--     (mismo patron de error que SAF). Esta asercion es ORTOGONAL al bug de
--     Unit A: el codigo viejo (pre-fix) TAMBIEN era internamente consistente
--     (`monto = montoUsd` crudo, `saldo_nuevo = saldoActual + montoUsd` ->
--     la igualdad se cumplia igual) — por eso NO detecta el bug original, y
--     por eso es seguro aplicar esta migracion en cualquier orden respecto al
--     fix de app (Unit A). Su proposito es atrapar bugs de WIRING FUTUROS
--     (ej. un caller que omita `saldo_nuevo` o lo calcule mal), no sustituir
--     el fix de capa 1.
--
--     Prueba de no-falso-positivo (D5, ver design.md para el detalle
--     completo de cada caso):
--       - Reverso directo simple: `saldoNuevo = saldoActual + ventaDeltaReal`,
--         `monto = ventaDeltaReal` -> igualdad exacta.
--       - Fan-in global (N llamadas a `reversarPagoEnTx` en el loop de
--         `reversarAbonoDirectoDesdeTesoreria`, misma tx): cada llamada lee
--         `clientes` YA actualizado por la anterior -> cada fila cumple la
--         igualdad individualmente.
--       - SAF-reversal (`reversarPagoSafEnTx`, rama estructuralmente
--         separada, nunca tocada por Unit A ni por esta migracion): ya
--         escribe `monto = montoAplicadoUsd` y
--         `saldo_nuevo = saldoAnterior + montoAplicadoUsd` -> satisface la
--         igualdad sin cambios de comportamiento.
--
--   ORDEN DELIBERADO dentro de este archivo: PRIMERO la reconciliacion
--     (Parte 1), DESPUES la asercion (Parte 2). La reconciliacion hace un
--     UPDATE DIRECTO sobre `clientes` — NUNCA pasa por el trigger
--     `actualizar_saldo_cliente()` (ese trigger dispara en INSERT sobre
--     `movimientos_cuenta`, tabla que esta migracion no toca) — por lo que
--     la asercion nueva de Parte 2 no puede, en los hechos, rechazar nada de
--     la Parte 1. Aun asi, se mantiene este orden por seguridad narrativa y
--     porque es el orden que exige la revision: "reconciliar el drift
--     preexistente ANTES de que la asercion nueva pueda rechazarlo" — si en
--     el futuro alguien reescribe la reconciliacion para pasar por
--     `movimientos_cuenta`, este orden sigue siendo el correcto.
--
-- SEGURO DE RE-EJECUTAR (idempotente):
--   - Parte 1: solo corrige filas donde
--     `ABS(deuda_real - saldo_pendiente_usd) > 0.005` (umbral-guardado, mismo
--     patron que 0061/0062/0089/0111/0116). Primera corrida: corrige N
--     clientes con drift real. Segunda corrida (sin cambios intermedios):
--     el drift de cada cliente corregido es ahora ~0 (por debajo del umbral)
--     -> 0 filas afectadas, `RAISE NOTICE` reporta 0.
--   - Parte 2: `CREATE OR REPLACE FUNCTION` — reemplazo total, no
--     incremental. Re-ejecutar el archivo completo produce el mismo estado
--     final que ejecutarlo una vez.
--   - NUNCA toca `movimientos_cuenta` (ni INSERT, ni UPDATE, ni DELETE) —
--     tabla inmutable sin cambios de forma ni de datos en este archivo.
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, esta sesion no
-- tiene credenciales de DB para ejecutarlo):
--
--   -- TC6: Reconciliacion idempotente -------------------------------------
--   BEGIN;
--     -- Simular drift: cliente de prueba con saldo_pendiente_usd/saldo_actual
--     -- $20 mas de lo que indican sus ventas activas reales.
--     UPDATE clientes
--       SET saldo_pendiente_usd = saldo_pendiente_usd + 20,
--           saldo_actual        = saldo_actual + 20
--       WHERE id = '<cliente-test>';
--     -- (Ejecutar aqui el bloque DO $$ de la Parte 1 de este archivo, o todo
--     -- el archivo completo.)
--     -- 1ra corrida: debe corregir exactamente este cliente (delta=-20).
--     SELECT saldo_pendiente_usd, saldo_actual FROM clientes WHERE id = '<cliente-test>';
--     -- Esperado: valores originales (pre-drift) restaurados.
--     -- 2da corrida (ejecutar la Parte 1 de nuevo, mismo bloque): debe
--     -- reportar 0 clientes corregidos (RAISE NOTICE) — el cliente ya no
--     -- tiene drift > 0.005.
--   ROLLBACK;
--
--   -- TC7: Asercion REV rechaza/pasa -----------------------------------
--   BEGIN;
--     -- Caso BUENO: saldo_nuevo = saldo_anterior + monto (debe tener exito).
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--        'TEST-0118-OK', 10, 0, 10, now(), now(), '<usuario-test>');
--     -- Esperado: INSERT exitoso, clientes.saldo_actual/saldo_pendiente_usd
--     -- suben por 10.
--
--     -- Caso MALO: saldo_nuevo NO coincide con saldo_anterior + monto
--     -- (debe fallar con P0001).
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--        'TEST-0118-BAD', 10, 0, 999, now(), now(), '<usuario-test>');
--     -- Esperado: RAISE EXCEPTION 'REV saldo_nuevo (...) inconsistente...'
--     -- con ERRCODE = 'P0001'.
--   ROLLBACK;
--
--   (Ambos bloques terminan en ROLLBACK, cero efecto persistente. Reemplazar
--   los placeholders `<...>` con IDs reales de un cliente/empresa/usuario de
--   prueba antes de ejecutar.)
--
-- ROLLBACK:
--   Parte 2 (funcion): re-aplicar 0115_add_safv_tipo_movimientos_cuenta.sql
--     (CREATE OR REPLACE FUNCTION) verbatim — restaura el cuerpo sin la rama
--     REV (no hay cambio de constraint/columna en esta migracion).
--   Parte 1 (reconciliacion): NO aplica un rollback de datos (es una
--     CORRECCION de datos, no una migracion de forma). Si se necesita
--     revertir, restaurar `clientes.saldo_pendiente_usd`/`saldo_actual` desde
--     un backup previo a esta ejecucion. No hay DDL que revertir en la
--     Parte 1.
-- =============================================================================

BEGIN;

-- ─── Parte 1: Reconciliacion de drift preexistente (D3/D4) ─────────────────
DO $$
DECLARE
  v_corregidos INTEGER;
BEGIN
  -- Autoriza el UPDATE directo sobre clientes para este bloque de
  -- reparacion (transaction-local) — mismo canal oficial que usa el propio
  -- trigger actualizar_saldo_cliente() (0061/0062/0089/0102/0110/0114/0115).
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

  WITH real AS (
    SELECT
      v.cliente_id,
      v.empresa_id,
      SUM(CAST(v.saldo_pend_usd AS NUMERIC)) AS deuda_real
    FROM ventas v
    WHERE v.status != 'ANULADA'
    GROUP BY v.cliente_id, v.empresa_id
  ), drift AS (
    SELECT
      c.id,
      COALESCE(r.deuda_real, 0) - CAST(c.saldo_pendiente_usd AS NUMERIC) AS delta
    FROM clientes c
    LEFT JOIN real r ON r.cliente_id = c.id AND r.empresa_id = c.empresa_id
    WHERE ABS(COALESCE(r.deuda_real, 0) - CAST(c.saldo_pendiente_usd AS NUMERIC)) > 0.005
  )
  UPDATE clientes c
  SET
    saldo_pendiente_usd = CAST(c.saldo_pendiente_usd AS NUMERIC) + d.delta,
    saldo_actual         = CAST(c.saldo_actual AS NUMERIC) + d.delta,
    updated_at = NOW()
  FROM drift d
  WHERE d.id = c.id;

  GET DIAGNOSTICS v_corregidos = ROW_COUNT;
  RAISE NOTICE '0118_reconciliar_saldo_cliente_y_assertion_rev: % cliente(s) corregido(s) por drift > 0.005 entre SUM(ventas.saldo_pend_usd WHERE status != ''ANULADA'') y clientes.saldo_pendiente_usd/saldo_actual.', v_corregidos;
END $$;

-- ─── Parte 2: Asercion de consistencia para REV (D5) ────────────────────────
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes — that created the race
  -- condition fixed in migration 0060. Keep that fix.
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo IN ('SAF', 'SAFV') THEN
    -- SAF/SAFV cover two directions the trigger cannot distinguish from
    -- monto alone (monto is always positive, CHECK constraint):
    -- debt-reduction (saldo_anterior - monto, SAF-CxC flujo de pago de
    -- factura/vencimiento preexistente) or credit-consumption
    -- (saldo_anterior + monto, SAF/SAFV usado como metodo de pago). SAFV se
    -- agrega a ESTA MISMA rama (no una nueva): el movimiento de
    -- saldo_actual es identico al de SAF, misma ambiguedad de signo
    -- (migrations/0115, Opcion B1). Trust the app-computed value (same
    -- treatment as REV/SAL below), but assert internal consistency so a
    -- caller bug (e.g. omitted saldo_nuevo) fails loudly instead of
    -- silently corrupting the ledger a third time.
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.tipo = 'REV' THEN
    -- REV reabre la deuda pendiente tras un reverso de abono — a diferencia
    -- de SAF/SAFV, la direccion es FIJA (+): saldo_nuevo SIEMPRE debe ser
    -- saldo_anterior + monto (reverso de pago nunca reduce deuda). Defensa
    -- en profundidad (migrations/0118, design fix-saldo-cliente-doble-reverso,
    -- decision D5) — NO detecta el bug original de doble-conteo (el codigo
    -- viejo tambien era internamente consistente bajo esta misma formula,
    -- ver cabecera de este archivo); atrapa bugs de wiring FUTUROS donde
    -- saldo_nuevo/monto queden desincronizados.
    IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (no
  -- recalculation, no consistency assertion — unchanged from 0114). REV
  -- (above) now asserts consistency but still does NOT recalculate
  -- saldo_nuevo — the app-computed value is trusted and merely validated,
  -- same pattern as SAF/SAFV.

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo,
        -- saf_disponible: delta atomico dentro del mismo UPDATE, SIN leer
        -- primero. 'SAFC' crea credito; 'SAF'/'SAFR'/'SAFV' lo consumen/
        -- anulan con la MISMA formula (piso en 0) — sin cambios por esta
        -- migracion (0118 no toca saf_disponible).
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: CASE SIN CAMBIOS respecto a 0110/0114/0115 —
        -- 'REV' ya estaba en la rama de suma (reabre deuda) desde 0110; esta
        -- migracion solo agrega la asercion de consistencia arriba, no
        -- cambia esta formula.
        saldo_pendiente_usd = CASE
          WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
          WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
          ELSE saldo_pendiente_usd
        END,
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
