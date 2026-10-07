-- =============================================================================
-- Migration: 0102_extender_trigger_saf_disponible.sql
-- Created:   2026-10-07
-- Depends:   0101_clientes_saf_disponible_column.sql (columna debe existir)
--            0088_fix_saf_trigger_sign.sql (cuerpo base de actualizar_saldo_cliente)
--
-- PURPOSE:
--   Extiende `actualizar_saldo_cliente()` (BEFORE INSERT en `movimientos_cuenta`)
--   para mantener `clientes.saf_disponible` en la MISMA pasada atomica que ya
--   mantiene `saldo_actual`. Zero nuevos round trips, zero nuevas filas en
--   `movimientos_cuenta` (tabla inmutable sin cambios de forma).
--
--   A diferencia de `saldo_actual` (que confia en el `saldo_nuevo` calculado
--   por la app para SAF/REV/SAL — ver 0088), `saf_disponible` usa una
--   expresion SQL atomica `saf_disponible ± NEW.monto` DENTRO del mismo
--   UPDATE: no hay lectura-previa-y-escritura desde la app, por lo que el
--   lock de fila del UPDATE serializa escritores concurrentes por
--   construccion. Esto evita por diseno la clase de bug de condicion de
--   carrera que `saldo_actual` sufrio en 0060/0088 (ver design.md
--   "Architecture Decisions").
--
--   CASE sobre NEW.tipo:
--     'SAFC' -> saf_disponible + NEW.monto   (creacion de credito)
--     'SAF'  -> GREATEST(0, saf_disponible - NEW.monto)  (consumo, piso en 0)
--     resto  -> saf_disponible sin cambios (FAC/NDB/PAG/NCR/REV/SAL no tocan
--               el credito standing — ver spec cxc-saf-snapshot Requirement
--               "Separacion de deuda y credito")
--
--   El resto del cuerpo de la funcion (computo de `saldo_nuevo` para cada
--   tipo, la asercion de consistencia de SAF) permanece IDENTICO a 0088 —
--   esta migracion solo agrega la mantencion de `saf_disponible` dentro del
--   bloque `IF NEW.saldo_nuevo IS NOT NULL THEN ... UPDATE clientes ...`.
--
--   Espejo TS puro (sin I/O): src/features/cxc/lib/saldo-cliente.ts
--   `calcularSafDisponibleNuevo` — mismos tests unitarios documentan el
--   comportamiento esperado, pero NO prueban que el trigger SQL coincida
--   (no existe infra de tests contra Postgres en este repo). Verificacion
--   manual recomendada antes de aplicar en produccion:
--
--     BEGIN;
--       -- cliente de prueba con saf_disponible = 100
--       UPDATE clientes SET saf_disponible = 100 WHERE id = '<cliente-test>';
--       INSERT INTO movimientos_cuenta
--         (id, empresa_id, cliente_id, tipo, referencia, monto,
--          saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--       VALUES
--         (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFC',
--          'TEST-0102', 50, 0, 0, now(), now(), '<usuario-test>');
--       -- Debe ser 150 (100 + 50)
--       SELECT saf_disponible FROM clientes WHERE id = '<cliente-test>';
--     ROLLBACK;
--
--     BEGIN;
--       UPDATE clientes SET saf_disponible = 30 WHERE id = '<cliente-test>';
--       INSERT INTO movimientos_cuenta
--         (id, empresa_id, cliente_id, tipo, referencia, monto,
--          saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--       VALUES
--         (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAF',
--          'TEST-0102-B', 100, 0, 100, now(), now(), '<usuario-test>');
--       -- Debe ser 0, NUNCA negativo (consumo excede disponible).
--       -- NOTA: saldo_nuevo DEBE respetar la asercion SAF del trigger
--       -- (lineas 91-95): ABS(ABS(saldo_nuevo - saldo_anterior) - monto) <= 0.005.
--       -- Con saldo_anterior=0 y monto=100 => saldo_nuevo=100 (consumo de
--       -- credito suma al saldo de deuda). Usar saldo_nuevo=0 aqui dispararia
--       -- la excepcion 'SAF saldo_nuevo inconsistent' ANTES de tocar saf_disponible.
--       SELECT saf_disponible FROM clientes WHERE id = '<cliente-test>';
--     ROLLBACK;
--
--   (Ninguno de los dos bloques hace COMMIT — ambos terminan en ROLLBACK,
--   cero efecto persistente. Reemplazar los placeholders `<...>` con IDs
--   reales de un cliente/empresa/usuario de prueba antes de ejecutar.)
--
-- ROLLBACK:
--   Re-aplicar 0088_fix_saf_trigger_sign.sql (CREATE OR REPLACE FUNCTION)
--   verbatim — restaura el UPDATE sin la columna saf_disponible.
-- =============================================================================

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
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
