-- =============================================================================
-- Migration: 0115_add_safv_tipo_movimientos_cuenta.sql
-- Created:   2026-10-19
-- Depends:   0114_add_safr_tipo_movimientos_cuenta.sql (cuerpo base vigente de
--              actualizar_saldo_cliente() — es la MAS RECIENTE CREATE OR
--              REPLACE de esta funcion, confirmado por grep sobre
--              migrations/: ningun archivo posterior a 0114 la redefine.
--              Extender el cuerpo de 0110/0102 en vez de este seria una
--              REGRESION CATASTROFICA: borraria silenciosamente el
--              mantenimiento de saf_disponible para SAFR agregado en 0114.)
--            fix/cxc-ledger-saf-venta-doble-descuento (PR #249, app-only fix,
--              YA MERGEADO a develop pero INSUFICIENTE — ver seccion BUG abajo)
--
-- BUG CONFIRMADO POR DATOS REALES DE STAGING (CLIENTE TEST 3, venta
-- C01-000021, generada DESPUES del merge de PR #249):
--   Venta CREDITO $100 + $50 SAF aplicado como metodo de pago. El bloque FAC
--   de `crearVenta` (use-ventas.ts) escribe deuda NETA
--   (saldo_pendiente_usd = 0 + 50 = 50, correcto — invariante FAC-es-neto,
--   `calcularCierreVentaConSaf`). El bloque SAF (misma tx) YA NO vuelve a
--   restar localmente (fix de PR #249, pass-through) — pero el trigger
--   SERVIDOR `actualizar_saldo_cliente()` (0110/0114) SI trata CUALQUIER
--   INSERT tipo='SAF' en `movimientos_cuenta` como reduccion de deuda
--   (`GREATEST(0, saldo_pendiente_usd - monto)`), sin poder distinguir esta
--   fila ("SAF como metodo de pago en una venta POS que YA nacio neta") de
--   una fila "SAF paga una factura PREEXISTENTE bruta" (flujo CxC, donde SI
--   debe restar). El dato real en staging confirma que el valor final en
--   servidor queda en 0, NO en 50 — la unica correccion robusta ANTE
--   CUALQUIER ORDEN de subida de la cola CRUD de PowerSync es eliminar la
--   AMBIGUEDAD DE ORIGEN en el propio trigger, no depender de que un PATCH
--   posterior de la app gane una carrera contra el trigger.
--
-- FIX (Opcion B1 del owner — el TODO/FOLLOW-UP documentado en
--   use-ventas.ts desde PR #249): nuevo tipo 'SAFV' ("SAF aplicado en
--   Venta") que el trigger trata como NEUTRAL para `saldo_pendiente_usd` EN
--   EL ORIGEN — cae en el mismo ELSE que SAFC/SAFR/SAL, nunca en la rama de
--   resta de PAG/NCR/SAF. Unico sitio de escritura que cambia de tipo: el
--   bloque SAF-VTA de `crearVenta` (use-ventas.ts, antes tipo='SAF', ahora
--   tipo='SAFV'). Los sitios de escritura de CxC en `use-cxc.ts`
--   (`aplicarPagoFacturaEnTx`, `registrarAbonoGlobal` x2,
--   `registrarSafExcedente`, el abono a prestamo vinculado a factura) SIGUEN
--   emitiendo 'SAF'/'SAFC' SIN CAMBIOS — ahi el SAF SI debe reducir deuda,
--   porque paga una factura/vencimiento preexistente que SI carga su deuda
--   bruta completa.
--
-- WHY saf_disponible SI CAMBIA (SAFV se agrega a la rama de consumo):
--   SAFV consume el credito standing exactamente igual que SAF/SAFR — sigue
--   siendo "usar saldo a favor", solo cambia el contexto de ORIGEN (venta
--   POS vs. pago de CxC), nunca la direccion del movimiento de credito.
--
-- WHY saldo_pendiente_usd NO CAMBIA (el punto central de este fix):
--   SAFV cae en el ELSE del CASE de `saldo_pendiente_usd` — EXACTAMENTE
--   igual que SAFC/SAFR/SAL hoy. La factura FAC que origina la venta YA
--   nacio neta del SAF (invariante FAC-es-neto), por lo que la fila SAFV
--   emparejada JAMAS debe volver a tocar la deuda pendiente — ni en la app,
--   ni en el trigger. Antes de este fix, la unica forma de lograr esto en
--   el trigger era confiar en que el PATCH de la app ganara la carrera
--   contra el trigger (fragil, demostrado roto por los datos reales de
--   staging). Con SAFV, NO HAY CARRERA: el trigger JAMAS resta para este
--   tipo, sin importar el orden de sync de la cola CRUD de PowerSync.
--
-- WHY saldo_nuevo (IF/ELSIF superior) SI CAMBIA (SAFV se agrega A LA MISMA
--   rama de 'SAF', NO crea un tratamiento nuevo):
--   El movimiento de `saldo_actual` para SAFV es IDENTICO al de SAF —
--   consumo de credito, `saldoAntesSaf.plus(monto)` (use-ventas.ts, sin
--   cambios por este fix). La MISMA ambiguedad de direccion que motiva que
--   el trigger confie en `NEW.saldo_nuevo` para 'SAF' (no puede inferir
--   signo solo de `monto`, siempre positivo) aplica igual a 'SAFV' — por
--   eso se agrega AL MISMO branch (`ELSIF NEW.tipo IN ('SAF', 'SAFV')`),
--   reutilizando la misma asercion de consistencia, en vez de crear un
--   tratamiento nuevo.
--
-- NO SE TOCAN: los sitios de escritura de CxC en use-cxc.ts (siguen
--   tipo='SAF'/'SAFC', siguen restando/sumando como siempre). NO se toca
--   connector.ts — `TRIGGER_MANAGED_PATCH_COLUMNS.clientes` sigue sin
--   incluir `saldo_pendiente_usd` (sigue sin hacer falta: con SAFV, app y
--   trigger COINCIDEN en que `saldo_pendiente_usd` no cambia para esta fila,
--   no existe ya un valor "erroneo" del trigger que un PATCH deba
--   sobreescribir).
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, esta sesion no
-- tiene credenciales de DB para ejecutarlo):
--
--   BEGIN;
--     UPDATE clientes SET saf_disponible = 50, saldo_pendiente_usd = 50
--       WHERE id = '<cliente-test>';
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFV',
--        'TEST-0115', 50, 0, 50, now(), now(), '<usuario-test>');
--     -- saldo_nuevo (50) se confia via la MISMA asercion que SAF: debe
--     -- coincidir con |saldo_anterior +/- monto| dentro de 0.005.
--     SELECT saf_disponible, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--     -- Esperado: saf_disponible=0 (50 - 50, consumo, NUNCA negativo),
--     -- saldo_pendiente_usd=50 SIN CAMBIOS (SAFV no toca deuda pendiente —
--     -- el punto central de este fix).
--   ROLLBACK;
--
-- ROLLBACK:
--   Re-aplicar 0114_add_safr_tipo_movimientos_cuenta.sql (CREATE OR REPLACE
--   FUNCTION) verbatim — restaura el CASE de saf_disponible/saldo_nuevo sin
--   'SAFV'.
--   ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
--   ALTER TABLE movimientos_cuenta ADD CONSTRAINT movimientos_cuenta_tipo_check
--     CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF', 'SAFC', 'SAFR'));
-- =============================================================================

BEGIN;

ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF', 'SAFC', 'SAFR', 'SAFV'));

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
  END IF;
  -- REV, SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (no
  -- recalculation, no consistency assertion — unchanged from 0114).

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo,
        -- saf_disponible: delta atomico dentro del mismo UPDATE, SIN leer
        -- primero. 'SAFC' crea credito; 'SAF'/'SAFR'/'SAFV' lo consumen/
        -- anulan con la MISMA formula (piso en 0) — SAFV se agrega a esta
        -- rama por la MISMA razon que SAFR: consumo de credito standing,
        -- difiere solo el ORIGEN (venta POS vs. pago de CxC vs. anulacion
        -- de remanente), nunca la matematica (migrations/0114, extendido
        -- aqui a SAFV). Cualquier otro tipo (FAC/NDB/PAG/NCR/REV/SAL) no
        -- toca el credito standing.
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: CASE SIN CAMBIOS respecto a 0110/0114 —
        -- 'SAFV' cae al ELSE junto con 'SAFC'/'SAFR'/'SAL'. Este es el
        -- PUNTO CENTRAL del fix (migrations/0115): la factura FAC que
        -- origina la venta YA nace neta del SAF aplicado (invariante
        -- FAC-es-neto, `calcularCierreVentaConSaf` en use-ventas.ts) — la
        -- fila SAFV emparejada JAMAS debe volver a tocar la deuda
        -- pendiente, EN EL ORIGEN, sin depender de que ningun PATCH
        -- posterior de la app gane una carrera contra este trigger (el bug
        -- que esta migracion corrige de raiz, confirmado por datos reales
        -- de staging — ver header de este archivo).
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
