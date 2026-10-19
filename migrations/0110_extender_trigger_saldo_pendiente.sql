-- =============================================================================
-- Migration: 0110_extender_trigger_saldo_pendiente.sql
-- Created:   2026-10-18
-- Depends:   0109_clientes_saldo_pendiente_column.sql (columna debe existir)
--            0102_extender_trigger_saf_disponible.sql (cuerpo base vigente de
--            actualizar_saldo_cliente() — es la MAS RECIENTE
--            CREATE OR REPLACE de esta funcion, confirmado por grep sobre
--            migrations/: ningun archivo posterior a 0102 la redefine)
--
-- PURPOSE:
--   Extiende `actualizar_saldo_cliente()` (BEFORE INSERT en `movimientos_cuenta`)
--   para mantener `clientes.saldo_pendiente_usd` en la MISMA pasada atomica
--   que ya mantiene `saldo_actual` y `saf_disponible`. Zero nuevos round
--   trips, zero nuevas filas en `movimientos_cuenta` (tabla inmutable sin
--   cambios de forma).
--
--   Igual que `saf_disponible` (0102), `saldo_pendiente_usd` usa una
--   expresion SQL atomica `saldo_pendiente_usd ± NEW.monto` DENTRO del mismo
--   UPDATE: no hay lectura-previa-y-escritura desde la app, por lo que el
--   lock de fila del UPDATE serializa escritores concurrentes por
--   construccion — misma garantia, mismo razonamiento que 0102.
--
--   CASE sobre NEW.tipo (espejo exacto de
--   `calcularSaldoPendienteClienteNuevo` en
--   src/features/cxc/lib/saldo-cliente.ts):
--     'FAC','NDB' -> saldo_pendiente_usd + NEW.monto   (nueva deuda: venta a
--                    credito, nota de debito)
--     'REV'       -> saldo_pendiente_usd + NEW.monto   (reverso reabre la
--                    factura — misma direccion que FAC/NDB)
--     'PAG','NCR','SAF' -> GREATEST(0, saldo_pendiente_usd - NEW.monto)
--                    (reduce deuda: pago/abono, nota de credito, o SAF usado
--                    como metodo de pago — piso en 0, nunca negativo)
--     resto (SAFC/SAL) -> saldo_pendiente_usd sin cambios (no tocan facturas
--                    pendientes — SAFC crea saldo a favor standing, SAL
--                    importa saldo inicial historico)
--
--   El resto del cuerpo de la funcion (computo de `saldo_nuevo` para cada
--   tipo, la asercion de consistencia de SAF, la mantencion de
--   `saf_disponible`) permanece IDENTICO a 0102 — esta migracion solo agrega
--   UNA columna mas al mismo CASE/UPDATE atomico.
--
--   Espejo TS puro (sin I/O): src/features/cxc/lib/saldo-cliente.ts
--   `calcularSaldoPendienteClienteNuevo` — mismos tests unitarios documentan
--   el comportamiento esperado, pero NO prueban que el trigger SQL coincida
--   (no existe infra de tests contra Postgres en este repo).
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, esta sesion no
-- tiene credenciales de DB para ejecutarlo):
--
--   BEGIN;
--     -- cliente de prueba con saldo_pendiente_usd = 0
--     UPDATE clientes SET saldo_pendiente_usd = 0 WHERE id = '<cliente-test>';
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'FAC',
--        'TEST-0110', 100, 0, 100, now(), now(), '<usuario-test>');
--     -- Debe ser 100 (0 + 100) — venta a credito aumenta la deuda pendiente.
--     SELECT saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   ROLLBACK;
--
--   BEGIN;
--     UPDATE clientes SET saldo_pendiente_usd = 20 WHERE id = '<cliente-test>';
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'PAG',
--        'TEST-0110-B', 50, 300, 250, now(), now(), '<usuario-test>');
--     -- Debe ser 0, NUNCA negativo (pago de $50 contra deuda pendiente de $20
--     -- promueve el excedente a SAF por fuera de este trigger — aqui solo
--     -- se verifica el piso en 0 de saldo_pendiente_usd).
--     SELECT saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   ROLLBACK;
--
--   (Ninguno de los dos bloques hace COMMIT — ambos terminan en ROLLBACK,
--   cero efecto persistente. Reemplazar los placeholders `<...>` con IDs
--   reales de un cliente/empresa/usuario de prueba antes de ejecutar.)
--
-- ROLLBACK:
--   Re-aplicar 0102_extender_trigger_saf_disponible.sql (CREATE OR REPLACE
--   FUNCTION) verbatim — restaura el UPDATE sin la columna
--   saldo_pendiente_usd.
-- =============================================================================

BEGIN;

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
  ELSIF NEW.tipo = 'SAF' THEN
    -- SAF covers two directions the trigger cannot distinguish from monto
    -- alone (monto is always positive, CHECK constraint): debt-reduction
    -- (saldo_anterior - monto) or credit-consumption (saldo_anterior + monto).
    -- Trust the app-computed value (same treatment as REV/SAL below), but
    -- assert internal consistency so a caller bug (e.g. omitted saldo_nuevo)
    -- fails loudly instead of silently corrupting the ledger a third time.
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- REV, SAL: saldo_nuevo stays as provided in the INSERT (no recalculation,
  -- unchanged from 0061)

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo,
        -- saf_disponible: delta atomico dentro del mismo UPDATE, SIN leer
        -- primero (a diferencia de saldo_actual). 'SAFC' crea credito,
        -- 'SAF' lo consume con piso en 0 (nunca negativo — spec
        -- cxc-saf-snapshot Requirement "piso en cero"). Cualquier otro tipo
        -- (FAC/NDB/PAG/NCR/REV/SAL) no toca el credito standing.
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo = 'SAF'  THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: mismo patron de delta atomico, espejo TS
        -- en calcularSaldoPendienteClienteNuevo. 'FAC'/'NDB' crean deuda
        -- (venta a credito, nota de debito); 'REV' reabre una factura
        -- (misma direccion, suma); 'PAG'/'NCR'/'SAF' reducen deuda (pago,
        -- nota de credito, o SAF como metodo de pago) con piso en 0.
        -- 'SAFC'/'SAL' no tocan facturas pendientes.
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
