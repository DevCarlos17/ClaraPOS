-- =============================================================================
-- Migration: 0121_mover_side_effect_a_after_insert.sql
-- Created:   2026-10-31
-- Depends:   0120_limpiar_trigger_debug_saldo_cliente.sql (YA MERGEADA a
--              origin/develop, commit 0989bcb0, PR #287).
-- Change:    fix-trigger-side-effect-after-insert — UNIT 1 de 3 (entrega
--              encadenada, ver openspec/changes/fix-trigger-side-effect-after-insert/).
--              Unit 2 (split de consumir_saf_lote(), tabla
--              saf_creditos_aplicaciones -> saf_creditos_lotes) y Unit 3
--              (script de limpieza de clientes de prueba en staging) llegan
--              en migraciones/PRs DE SEGUIMIENTO — NO estan en este archivo.
--
-- ROOT CAUSE (confirmado en vivo, obs #6079): PowerSync reenvia la MISMA fila
--   movimientos_cuenta (mismo id) en transacciones Postgres SEPARADAS tras un
--   retry de upload (repro real: 1 factura FAC $1, 3 intentos, txid
--   6231/6232/6242, timings +139ms/+1.9s = patron clasico de backoff).
--   `ON CONFLICT(id) DO NOTHING` descarta la fila duplicada en el ledger (la
--   UI muestra una sola factura) PERO el trigger `BEFORE INSERT`
--   actualizar_saldo_cliente() corre en CADA intento, ANTES de que Postgres
--   evalue el conflicto — el `UPDATE clientes SET saldo_actual/...` se
--   reaplicaba N veces (N intentos = saldo inflado x N: $1 de factura ->
--   $3 en el repro real). El bug NO requiere reverso ni multiples facturas:
--   cualquier INSERT en movimientos_cuenta que el sync reenvie infla el
--   saldo igual.
--
-- FIX: dividir `actualizar_saldo_cliente()` en DOS funciones/triggers:
--   1. `BEFORE INSERT` (adelgazada): SOLO muta `NEW.saldo_nuevo` (FAC/NDB/
--      PAG/NCR) y mantiene las aserciones de consistencia SAF/SAFV/REV.
--      CERO cambio de formula vs. 0120 — el bloque IF/ELSIF/aserciones es
--      byte-identico; unicamente se retira el bloque `UPDATE clientes` que
--      vivia debajo de el.
--   2. `AFTER INSERT` (nueva), `actualizar_saldo_cliente_after()`: contiene
--      el `UPDATE clientes SET saldo_actual/saf_disponible/
--      saldo_pendiente_usd/updated_at` relocado BYTE-IDENTICO (formulas/CASE
--      copiados verbatim — ver gate de byte-diff mas abajo) desde las lineas
--      115-191 de 0120, mas el `PERFORM set_config('clarapos.trigger_context',
--      'mov_cuenta', TRUE)` que debe moverse junto con el UPDATE:
--      `set_config(..., TRUE)` es transaction-scoped (`is_local=true`), NO
--      statement-scoped, asi que `validate_cliente_update()` (trigger BEFORE
--      UPDATE separado sobre `clientes`) lo lee correctamente sin importar
--      en que funcion dentro de la MISMA transaccion se haya seteado.
--
--   Postgres NO dispara triggers `AFTER ROW` para filas descartadas por
--   `ON CONFLICT DO NOTHING` (SI dispara los `BEFORE ROW`, para TODAS las
--   filas candidatas, incluidas las descartadas) — esta es la garantia
--   NATIVA de Postgres que cierra la causa raiz a nivel de semantica del
--   motor, sin inventar deduplicacion a nivel de aplicacion: el `AFTER`
--   ahora corre COMO MAXIMO una vez por fila que termina fisicamente
--   insertada, sin importar cuantos reintentos de sync precedieron ese
--   INSERT exitoso.
--
-- PRUEBA DE CORRECCION (BEFORE -> AFTER; desarrollo completo en
--   openspec/changes/fix-trigger-side-effect-after-insert/design.md
--   "Correctness Proof: BEFORE->AFTER Read Equivalence"): el `UPDATE`
--   relocado apunta a `clientes`, una tabla DISTINTA de la que recibe el
--   INSERT (`movimientos_cuenta`). Insertar una fila en `movimientos_cuenta`
--   nunca muta una fila de `clientes`, asi que la pre-imagen que lee el
--   UPDATE (`saldo_actual`/`saldo_pendiente_usd`/`saf_disponible` sin
--   calificar = fila previa al UPDATE) es identica sea que el UPDATE corra
--   microsegundos antes o despues del INSERT fisico, siempre dentro de la
--   MISMA transaccion/statement (sin COMMIT intermedio, sin otro escritor
--   posible de esas columnas — el unico escritor es este mismo trigger,
--   reforzado por `validate_cliente_update()`). Es un cambio de TIMING puro,
--   cero efecto en los valores calculados.
--
-- Postgres NO permite `ALTER TRIGGER` para cambiar el timing de disparo
--   (BEFORE -> AFTER) — solo permite renombrar / cambiar deferrability. Por
--   eso este archivo hace `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` para
--   las 2 declaraciones de trigger sobre `movimientos_cuenta` (la existente,
--   re-declarada igual pero apuntando a la funcion adelgazada, y la nueva
--   AFTER).
--
-- IDEMPOTENTE: `CREATE OR REPLACE FUNCTION` (x2) + `DROP TRIGGER IF EXISTS`
--   + `CREATE TRIGGER` (x2) — reemplazo total, mismo estado final sin
--   importar cuantas veces se corra este archivo.
--
-- FUERA DE ALCANCE (explicito, ver tasks.md Phase 1 / "Out of Scope"):
--   - NO se toca `consumir_saf_lote()` / `saf_creditos_aplicaciones` /
--     `saf_creditos_lotes` (Unit 2, migracion futura 0122+).
--   - NO se toca `anular_saf_lote_reversa()` / migration
--     `0113_saf_creditos_reversas.sql` (twin-bug #3 confirmado por lectura,
--     NO reproducido con datos reales — cambio SDD separado, decision
--     explicita de NO foldearlo aqui).
--   - NO se cambia ninguna formula, rama CASE, ni tolerancia de redondeo de
--     saldo — relocacion de timing pura, byte-identica.
--   - NO se toca `src/core/db/powersync/connector.ts` (`IMMUTABLE_TABLES`,
--     `ignoreDuplicates`, logica de retry/upload) — el fix vive enteramente
--     en el timing del trigger de Postgres.
--
-- ROLLBACK: ver bloque comentado al final de este archivo — restaura
--   `actualizar_saldo_cliente()` al cuerpo UNICO de 0120 (UPDATE
--   re-inlineado) y elimina el trigger/funcion AFTER nuevos.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BEFORE INSERT adelgazada: SOLO muta NEW.saldo_nuevo + aserciones.
--    Byte-identico al bloque IF/ELSIF/RAISE EXCEPTION de 0120 (lineas 71-110)
--    — se retira UNICAMENTE el bloque `IF NEW.saldo_nuevo IS NOT NULL THEN
--    ... UPDATE clientes ... END IF;` (0120 lineas 112-192), relocado abajo
--    en actualizar_saldo_cliente_after().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes for THIS computation — that
  -- created the race condition fixed in migration 0060. Keep that fix. This
  -- block is BYTE-IDENTICAL to the pre-0121 state (0120) — it feeds ONLY the
  -- immutable audit column movimientos_cuenta.saldo_nuevo and the
  -- SAF/SAFV/REV consistency assertions below. It no longer governs
  -- clientes.saldo_actual directly (that UPDATE now lives in the AFTER
  -- INSERT trigger actualizar_saldo_cliente_after(), see below) — it never
  -- governed it directly even before this split, it only fed the UPDATE
  -- that lived in this same function body.
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
    -- viejo tambien era internamente consistente bajo esta misma formula);
    -- atrapa bugs de wiring FUTUROS donde saldo_nuevo/monto queden
    -- desincronizados. Mantenida SIN CAMBIOS por esta migracion (0121).
    IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (no
  -- recalculation, no consistency assertion — unchanged from 0114/0118).

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 2. AFTER INSERT nueva: contiene el side-effect UPDATE clientes relocado.
--    Postgres NO dispara este trigger para filas descartadas por
--    ON CONFLICT DO NOTHING — ese es el fix (ver cabecera del archivo).
--    RETURN NULL es la convencion documentada para AFTER ROW triggers
--    (Postgres ignora el valor de retorno de un trigger AFTER ROW).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente_after()
RETURNS TRIGGER AS $$
BEGIN
  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  -- Movido junto con el UPDATE (antes vivia en el BEFORE, 0120 linea 114) —
  -- set_config(..., TRUE) es transaction-scoped, no statement-scoped, asi
  -- que setearlo aqui mismo, inmediatamente antes de su UPDATE consumidor,
  -- es funcionalmente identico y mantiene ambos juntos en una sola funcion
  -- (ver design.md Decision #2).
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    -- ===========================================================================
    -- BYTE-DIFF GATE (obligatorio, verificado por sdd-apply antes de entregar
    -- este cambio): el bloque `UPDATE clientes ... WHERE id = NEW.cliente_id;`
    -- que sigue es BYTE-IDENTICO (CERO cambio de formula, CASE, o tolerancia)
    -- al bloque equivalente de 0120 (lineas 115-191) — UNICAMENTE relocado
    -- de BEFORE a AFTER. Verificacion real ejecutada:
    --   awk 'NR>=115 && NR<=191' 0120_limpiar_trigger_debug_saldo_cliente.sql \
    --     | grep -vE '^\s*--' | sed '/^\s*$/d' > /tmp/0120_update_block.txt
    --   awk '/^    UPDATE clientes$/,/WHERE id = NEW.cliente_id;/' \
    --     0121_mover_side_effect_a_after_insert.sql \
    --     | grep -vE '^\s*--' | sed '/^\s*$/d' > /tmp/0121_update_block.txt
    --   diff /tmp/0120_update_block.txt /tmp/0121_update_block.txt
    --   md5sum /tmp/0120_update_block.txt /tmp/0121_update_block.txt
    -- RESULTADO: `diff` sin salida (SIN DIFERENCIAS), ambos md5sum
    -- IDENTICOS. Ver tasks.md Phase 1 tarea 1.4 para el log completo del
    -- comando ejecutado y su resultado durante el apply de este cambio.
    -- ===========================================================================
    UPDATE clientes
    SET
        -- saldo_actual (FIX 0119): formula RELATIVA, YA NO `= NEW.saldo_nuevo`
        -- verbatim (ese snapshot de la app podia quedar stale — ver cabecera
        -- de 0120, repro 4 pasos). Se auto-sana leyendo el valor VIVO de la
        -- fila (saldo_actual, saldo_pendiente_usd, saf_disponible SIN
        -- calificar = fila previa al UPDATE, mismo mecanismo que ya usan
        -- saf_disponible/saldo_pendiente_usd desde 0102/0110, cero queries
        -- nuevas, mismo row-lock) y reaplicando los MISMOS deltas que las
        -- dos columnas hermanas, para TODOS los tipos excepto SAL (ancla
        -- absoluta legacy preservada, ver design.md Part 1 prueba por
        -- induccion):
        --   saldo_actual = saldo_actual_viejo + delta_pendiente - delta_saf
        -- INVARIANTE OBLIGATORIO (cada bracket DEBE ser nuevo-menos-viejo,
        -- NUNCA viejo-menos-nuevo): delta_pendiente debe ser EXACTAMENTE
        -- `(expresion del CASE de saldo_pendiente_usd para ese tipo) -
        -- saldo_pendiente_usd` y delta_saf debe ser EXACTAMENTE `(expresion
        -- del CASE de saf_disponible para ese tipo) - saf_disponible` — de
        -- lo contrario `saldo_actual = saldo_pendiente_usd - saf_disponible`
        -- (identidad canonica, design.md Part 0) deja de cumplirse. SAFV NO
        -- entra en la rama de pendiente (cae en el ELSE, delta_pendiente=0,
        -- igual que saldo_pendiente_usd real abajo) PERO SI entra en la
        -- rama de saf_disponible (delta_saf=consumo de credito, nuevo-viejo)
        -- — verificado linea por linea contra el CASE real de
        -- saldo_pendiente_usd (0115/0118, NO la parafrasis del diseno, ver
        -- cabecera "DESVIACION VERIFICADA").
        saldo_actual = CASE
          WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo
          ELSE
            saldo_actual
            + (CASE
                 WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN NEW.monto
                 WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF')
                      THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
                 ELSE 0
               END)
            - (CASE
                 WHEN NEW.tipo = 'SAFC' THEN NEW.monto
                 WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV')
                      THEN GREATEST(0, saf_disponible - NEW.monto) - saf_disponible
                 ELSE 0
               END)
        END,
        -- saf_disponible: BYTE-IDENTICO a 0115/0118/0120, sin cambios por 0121.
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: BYTE-IDENTICO a 0110/0114/0115/0118/0120, sin
        -- cambios por 0121. SAFV cae en el ELSE (punto central del fix de
        -- 0115 — la venta ya nace neta del SAF, esta fila jamas vuelve a
        -- tocar la deuda pendiente).
        saldo_pendiente_usd = CASE
          WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
          WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
          ELSE saldo_pendiente_usd
        END,
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NULL; -- AFTER ROW return value is ignored by Postgres; NULL is the documented convention.
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 3. Trigger declarations. Postgres no permite ALTER TRIGGER para cambiar
--    timing (BEFORE -> AFTER) — DROP + CREATE es obligatorio para ambos.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente ON movimientos_cuenta;
CREATE TRIGGER trg_actualizar_saldo_cliente
  BEFORE INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente_after ON movimientos_cuenta;
CREATE TRIGGER trg_actualizar_saldo_cliente_after
  AFTER INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente_after();

COMMIT;

-- =============================================================================
-- VERIFICACION MANUAL EN STAGING (owner — bloques BEGIN;...ROLLBACK;, cero
-- efecto persistente, reemplazar los placeholders <...> con IDs reales de un
-- cliente/empresa/usuario de PRUEBA DESCARTABLE antes de ejecutar). Dos
-- bloques, en orden:
--   TC-UNICO-FIRE-MATRIX: regresion — un INSERT unico por cada tipo soportado
--     debe producir EXACTAMENTE el mismo delta que la funcion vigente antes
--     de 0121 (sin doble-conteo, sin cambio de formula).
--   TC-RETRY-SIMULADO: el fix — simula el reenvio exacto de PowerSync (mismo
--     id, ON CONFLICT DO NOTHING, 3 intentos en transacciones Postgres
--     separadas) y confirma que el saldo neto sube UNA SOLA VEZ, no 3 veces.
-- Ambos bloques usan DO $$ ... $$ con RAISE EXCEPTION como asercion
-- automatica (no requieren comparacion visual de SELECTs) — si alguna
-- asercion falla, el bloque aborta con P0001 ANTES del ROLLBACK final,
-- dejando claro cual tipo/caso fallo.
-- =============================================================================

-- -- TC-UNICO-FIRE-MATRIX: un INSERT por tipo, reseteando el cliente de prueba
-- -- entre cada tipo, dentro de UNA sola transaccion (todo se revierte al final).
-- BEGIN;
--   DO $$
--   DECLARE
--     v_cliente  CONSTANT uuid := '<cliente-test>';
--     v_empresa  CONSTANT uuid := '<empresa-test>';
--     v_usuario  CONSTANT uuid := '<usuario-test>';
--     v_actual   NUMERIC(20,8);
--     v_pend     NUMERIC(20,8);
--     v_saf      NUMERIC(20,8);
--   BEGIN
--     -- FAC: deuda nueva. baseline 0/0/0 -> esperado pend=1, actual=1, saf=0.
--     UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'FAC', 'TC-MATRIX-FAC', 1, 0, 1, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 1 OR v_actual <> 1 OR v_saf <> 0 THEN
--       RAISE EXCEPTION 'TC-MATRIX-FAC fallo: actual=% pend=% saf=% (esperado 1/1/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- NDB: misma rama que FAC. baseline 0/0/0 -> esperado pend=1, actual=1, saf=0.
--     UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'NDB', 'TC-MATRIX-NDB', 1, 0, 1, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 1 OR v_actual <> 1 OR v_saf <> 0 THEN
--       RAISE EXCEPTION 'TC-MATRIX-NDB fallo: actual=% pend=% saf=% (esperado 1/1/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- PAG: reduce deuda. baseline actual=5/pend=5/saf=0, monto=2 -> esperado pend=3, actual=3.
--     UPDATE clientes SET saldo_actual=5, saldo_pendiente_usd=5, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'PAG', 'TC-MATRIX-PAG', 2, 5, 3, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 3 OR v_actual <> 3 THEN
--       RAISE EXCEPTION 'TC-MATRIX-PAG fallo: actual=% pend=% saf=% (esperado 3/3/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- NCR: misma rama que PAG. baseline actual=5/pend=5/saf=0, monto=2 -> esperado pend=3, actual=3.
--     UPDATE clientes SET saldo_actual=5, saldo_pendiente_usd=5, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'NCR', 'TC-MATRIX-NCR', 2, 5, 3, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 3 OR v_actual <> 3 THEN
--       RAISE EXCEPTION 'TC-MATRIX-NCR fallo: actual=% pend=% saf=% (esperado 3/3/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- SAF: paga deuda preexistente con credito SAF. baseline actual=1/pend=5/saf=4,
--     -- monto=2, saldo_nuevo=saldo_anterior-monto=3 (direccion debt-reduction) ->
--     -- esperado pend=3, saf=2, actual=1 (identidad canonica pend-saf se preserva: 5-4=1, 3-2=1).
--     UPDATE clientes SET saldo_actual=1, saldo_pendiente_usd=5, saf_disponible=4
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'SAF', 'TC-MATRIX-SAF', 2, 5, 3, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 3 OR v_saf <> 2 OR v_actual <> 1 THEN
--       RAISE EXCEPTION 'TC-MATRIX-SAF fallo: actual=% pend=% saf=% (esperado 1/3/2)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- SAFV: SAF usado como metodo de pago en venta (no toca pendiente).
--     -- baseline actual=1/pend=5/saf=4, monto=2, saldo_nuevo=saldo_anterior+monto=7
--     -- (direccion credit-consumption) -> esperado pend=5 (sin cambio), saf=2, actual=3.
--     UPDATE clientes SET saldo_actual=1, saldo_pendiente_usd=5, saf_disponible=4
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'SAFV', 'TC-MATRIX-SAFV', 2, 5, 7, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 5 OR v_saf <> 2 OR v_actual <> 3 THEN
--       RAISE EXCEPTION 'TC-MATRIX-SAFV fallo: actual=% pend=% saf=% (esperado 3/5/2)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- SAFC: crea credito SAF nuevo. baseline 0/0/0, monto=3 -> esperado pend=0
--     -- (sin cambio), saf=3, actual=-3 (credito sin deuda asociada todavia).
--     UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'SAFC', 'TC-MATRIX-SAFC', 3, 0, 0, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 0 OR v_saf <> 3 OR v_actual <> -3 THEN
--       RAISE EXCEPTION 'TC-MATRIX-SAFC fallo: actual=% pend=% saf=% (esperado -3/0/3)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- SAFR: anula lote SAF no consumido. baseline actual=-5/pend=0/saf=5,
--     -- monto=2 -> esperado pend=0 (sin cambio), saf=3, actual=-3.
--     UPDATE clientes SET saldo_actual=-5, saldo_pendiente_usd=0, saf_disponible=5
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'SAFR', 'TC-MATRIX-SAFR', 2, 0, 0, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 0 OR v_saf <> 3 OR v_actual <> -3 THEN
--       RAISE EXCEPTION 'TC-MATRIX-SAFR fallo: actual=% pend=% saf=% (esperado -3/0/3)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- SAL: ancla absoluta legacy, NO toca pend/saf. baseline actual=10/pend=10/saf=0,
--     -- saldo_nuevo=7 -> esperado actual=7, pend=10 (sin cambio), saf=0 (sin cambio).
--     UPDATE clientes SET saldo_actual=10, saldo_pendiente_usd=10, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'SAL', 'TC-MATRIX-SAL', 7, 0, 7, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_actual <> 7 OR v_pend <> 10 OR v_saf <> 0 THEN
--       RAISE EXCEPTION 'TC-MATRIX-SAL fallo: actual=% pend=% saf=% (esperado 7/10/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     -- REV: reabre deuda tras reverso de abono. baseline 0/0/0, monto=4,
--     -- saldo_nuevo=saldo_anterior+monto=4 -> esperado pend=4, actual=4, saf=0.
--     UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (gen_random_uuid(), v_empresa, v_cliente, 'REV', 'TC-MATRIX-REV', 4, 0, 4, now(), now(), v_usuario);
--     SELECT saldo_actual, saldo_pendiente_usd, saf_disponible INTO v_actual, v_pend, v_saf
--       FROM clientes WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 4 OR v_actual <> 4 OR v_saf <> 0 THEN
--       RAISE EXCEPTION 'TC-MATRIX-REV fallo: actual=% pend=% saf=% (esperado 4/4/0)', v_actual, v_pend, v_saf;
--     END IF;
--
--     RAISE NOTICE 'TC-UNICO-FIRE-MATRIX: PASS (10/10 tipos, sin regresion vs. 0120)';
--   END;
--   $$;
-- ROLLBACK;

-- -- TC-RETRY-SIMULADO: el fix. Mismo id reenviado 3 veces (igual al patron
-- -- real de PowerSync, obs #6079), ON CONFLICT(id) DO NOTHING descarta las
-- -- filas 2 y 3 -> el AFTER INSERT no debe disparar para esas dos, el saldo
-- -- debe subir UNA SOLA VEZ (no 3x).
-- BEGIN;
--   DO $$
--   DECLARE
--     v_cliente  CONSTANT uuid := '<cliente-test>';
--     v_empresa  CONSTANT uuid := '<empresa-test>';
--     v_usuario  CONSTANT uuid := '<usuario-test>';
--     v_mov_id   CONSTANT uuid := gen_random_uuid(); -- MISMO id en los 3 intentos.
--     v_pend     NUMERIC(20,8);
--     v_filas    INT;
--   BEGIN
--     UPDATE clientes SET saldo_actual=0, saldo_pendiente_usd=0, saf_disponible=0
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--
--     -- Intento 1 (exitoso): BEFORE fija saldo_nuevo, fila se inserta sin
--     -- conflicto, AFTER dispara -> +$1.
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_id, v_empresa, v_cliente, 'FAC', 'TC-RETRY-SIMULADO', 1, 0, 1, now(), now(), v_usuario)
--     ON CONFLICT (id) DO NOTHING;
--
--     -- Intento 2 (reenvio, MISMO id): BEFORE dispara igual (inevitable, corre
--     -- para toda fila candidata) pero NEW se descarta -> conflicto detectado
--     -- -> fila NO se inserta -> AFTER NO dispara. Este es el fix.
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_id, v_empresa, v_cliente, 'FAC', 'TC-RETRY-SIMULADO', 1, 0, 1, now(), now(), v_usuario)
--     ON CONFLICT (id) DO NOTHING;
--
--     -- Intento 3 (reenvio, MISMO id): identico al intento 2.
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_id, v_empresa, v_cliente, 'FAC', 'TC-RETRY-SIMULADO', 1, 0, 1, now(), now(), v_usuario)
--     ON CONFLICT (id) DO NOTHING;
--
--     SELECT count(*) INTO v_filas FROM movimientos_cuenta WHERE id = v_mov_id;
--     IF v_filas <> 1 THEN
--       RAISE EXCEPTION 'TC-RETRY-SIMULADO fallo: % filas con el mismo id (esperado 1, ON CONFLICT no descarto los reenvios)', v_filas;
--     END IF;
--
--     SELECT saldo_pendiente_usd INTO v_pend FROM clientes
--       WHERE id=v_cliente AND empresa_id=v_empresa;
--     IF v_pend <> 1 THEN
--       RAISE EXCEPTION 'TC-RETRY-SIMULADO fallo: saldo_pendiente_usd=% (esperado 1 — si da 3, el AFTER volvio a disparar en los reenvios descartados, bug NO corregido)', v_pend;
--     END IF;
--
--     RAISE NOTICE 'TC-RETRY-SIMULADO: PASS (1 fila, 1 solo delta de $1 pese a 3 intentos de INSERT con el mismo id)';
--   END;
--   $$;
-- ROLLBACK;

-- =============================================================================
-- ROLLBACK DE ESTA MIGRACION (documentado, NO auto-ejecutado). Restaura
-- actualizar_saldo_cliente() al cuerpo UNICO de 0120 (BEFORE con el UPDATE
-- re-inlineado) y elimina el trigger/funcion AFTER nuevos. Dry-run de este
-- bloque (BEGIN; <esto>; ROLLBACK;) debe confirmarse antes de mergear —
-- restaura 0120 byte-por-byte.
-- =============================================================================

-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente_after ON movimientos_cuenta;
--   DROP FUNCTION IF EXISTS actualizar_saldo_cliente_after();
--
--   CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     IF NEW.tipo IN ('FAC', 'NDB') THEN
--       NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
--     ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
--       NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
--     ELSIF NEW.tipo IN ('SAF', 'SAFV') THEN
--       IF NEW.saldo_nuevo IS NULL
--          OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
--         RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
--           NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
--       END IF;
--     ELSIF NEW.tipo = 'REV' THEN
--       IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
--         RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
--           NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
--       END IF;
--     END IF;
--
--     IF NEW.saldo_nuevo IS NOT NULL THEN
--       PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
--       UPDATE clientes
--       SET
--           saldo_actual = CASE
--             WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo
--             ELSE
--               saldo_actual
--               + (CASE
--                    WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN NEW.monto
--                    WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF')
--                         THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
--                    ELSE 0
--                  END)
--               - (CASE
--                    WHEN NEW.tipo = 'SAFC' THEN NEW.monto
--                    WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV')
--                         THEN GREATEST(0, saf_disponible - NEW.monto) - saf_disponible
--                    ELSE 0
--                  END)
--           END,
--           saf_disponible = CASE
--             WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
--             WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
--             ELSE saf_disponible
--           END,
--           saldo_pendiente_usd = CASE
--             WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
--             WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
--             ELSE saldo_pendiente_usd
--           END,
--           updated_at   = NOW()
--       WHERE id = NEW.cliente_id;
--     END IF;
--
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
--   DROP TRIGGER IF EXISTS trg_actualizar_saldo_cliente ON movimientos_cuenta;
--   CREATE TRIGGER trg_actualizar_saldo_cliente
--     BEFORE INSERT ON movimientos_cuenta
--     FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();
-- COMMIT;
