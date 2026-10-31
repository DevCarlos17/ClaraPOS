-- =============================================================================
-- Migration: 0122_mover_consumir_saf_lote_a_after_insert.sql
-- Created:   2026-10-31
-- Depends:   0121_mover_side_effect_a_after_insert.sql (YA MERGEADA a
--              origin/develop, commit 4ceab344, PR #288).
-- Change:    fix-trigger-side-effect-after-insert — UNIT 2 de 3 (entrega
--              encadenada, ver openspec/changes/fix-trigger-side-effect-after-insert/).
--              Unit 1 (split de actualizar_saldo_cliente(), 0121) YA
--              MERGEADA. Unit 3 (script de limpieza de clientes de prueba en
--              staging) llega en una migracion/PR DE SEGUIMIENTO — NO esta
--              en este archivo.
--
-- ROOT CAUSE (bug gemelo del fijado en 0121, misma forma defectuosa,
--   confirmado por lectura en vivo de pg_get_functiondef — ver obs #6079 /
--   #6082 hallazgo #4, AUN NO reproducido con datos reales en
--   saf_creditos_aplicaciones, pero expuesto a la MISMA clase de reenvio de
--   PowerSync que ya se confirmo en vivo para movimientos_cuenta): la tabla
--   `saf_creditos_aplicaciones` esta en `IMMUTABLE_TABLES`
--   (src/core/db/powersync/connector.ts linea 174), igual que
--   `movimientos_cuenta` — un PUT reintentado de PowerSync usa
--   `INSERT ... ON CONFLICT(id) DO NOTHING`. El trigger
--   `consumir_saf_lote()` (migrations/0105), `BEFORE INSERT` sobre
--   `saf_creditos_aplicaciones`, mezcla el calculo de auditoria de NEW
--   (`lote_saldo_antes_usd`/`lote_saldo_despues_usd`) con el side-effect
--   `UPDATE saf_creditos_lotes SET saldo_disponible_usd/status/...` en el
--   mismo BEFORE. Si PowerSync reenvia la misma fila `saf_creditos_aplicaciones`
--   (mismo `id`) en transacciones Postgres separadas, Postgres dispara el
--   `BEFORE INSERT` en CADA intento (ANTES de evaluar el conflicto) y
--   reaplica el `UPDATE saf_creditos_lotes` N veces — mismo patron exacto
--   que el bug ya confirmado y corregido en 0121 para
--   `movimientos_cuenta`/`clientes`.
--
-- FIX: dividir `consumir_saf_lote()` en DOS funciones/triggers (identico
--   patron a 0121):
--   1. `BEFORE INSERT` (adelgazada): mantiene el `SELECT ... FOR UPDATE`
--      (row lock explicito sobre el lote), las excepciones de
--      lote-no-encontrado/sobregiro, y la asignacion de
--      `NEW.lote_saldo_antes_usd`/`NEW.lote_saldo_despues_usd`. CERO cambio
--      de formula vs. 0105 — este bloque es byte-identico; unicamente se
--      retira el `PERFORM set_config(...)` + el bloque
--      `UPDATE saf_creditos_lotes` que vivian debajo.
--   2. `AFTER INSERT` (nueva), `consumir_saf_lote_after()`: contiene el
--      `UPDATE saf_creditos_lotes SET saldo_disponible_usd/status/
--      updated_at` relocado (ver gate de byte-diff mas abajo), mas el
--      `PERFORM set_config('clarapos.trigger_context','saf_aplicacion',TRUE)`
--      que debe moverse junto con el UPDATE (set_config(..., TRUE) es
--      transaction-scoped, no statement-scoped — identico razonamiento que
--      design.md Decision #2, ya aplicado en 0121).
--
--   DIFERENCIA DELIBERADA vs. simplemente copiar el patron de 0121: el
--   `UPDATE saf_creditos_lotes` del AFTER NO vuelve a `SELECT` el saldo del
--   lote. El `FOR UPDATE` tomado en el BEFORE se mantiene hasta el final de
--   la transaccion (no del statement) — Postgres garantiza esto — asi que
--   el AFTER lee `NEW.lote_saldo_despues_usd` (ya calculado y clamped en el
--   BEFORE bajo ese mismo lock) en vez de re-ejecutar el `SELECT ... FOR
--   UPDATE` y repetir el clamp/excepcion de sobregiro una segunda vez. Esto
--   evita duplicar la logica de calculo en dos funciones (design.md
--   Decision #3, hallazgo #3).
--
--   Postgres NO dispara triggers `AFTER ROW` para filas descartadas por
--   `ON CONFLICT DO NOTHING` (SI dispara los `BEFORE ROW`, para TODAS las
--   filas candidatas, incluidas las descartadas) — misma garantia nativa
--   que cerro el bug en 0121, aplicada aqui al segundo trigger con la misma
--   forma defectuosa.
--
-- PRUEBA DE CORRECCION (BEFORE -> AFTER): el `UPDATE` relocado apunta a
--   `saf_creditos_lotes`, una tabla DISTINTA de la que recibe el INSERT
--   (`saf_creditos_aplicaciones`). Insertar una fila en
--   `saf_creditos_aplicaciones` nunca muta una fila de `saf_creditos_lotes`,
--   asi que la pre-imagen que lee el UPDATE es identica sea que corra
--   microsegundos antes o despues del INSERT fisico, dentro de la MISMA
--   transaccion (sin COMMIT intermedio, sin otro escritor posible de esas
--   columnas — el unico escritor es este mismo trigger, reforzado por
--   `validate_saf_lote_update()` de 0104). Cambio de TIMING puro.
--
-- Postgres no permite `ALTER TRIGGER` para cambiar el timing (BEFORE ->
--   AFTER) — por eso este archivo hace `DROP TRIGGER IF EXISTS` +
--   `CREATE TRIGGER` para las 2 declaraciones de trigger sobre
--   `saf_creditos_aplicaciones`.
--
-- IDEMPOTENTE: `CREATE OR REPLACE FUNCTION` (x2) + `DROP TRIGGER IF EXISTS`
--   + `CREATE TRIGGER` (x2) — reemplazo total, mismo estado final sin
--   importar cuantas veces se corra este archivo.
--
-- FUERA DE ALCANCE (explicito, ver tasks.md Phase 2 / "Out of Scope"):
--   - NO se toca `actualizar_saldo_cliente()` / `movimientos_cuenta` /
--     `clientes` (Unit 1, ya mergeada en 0121).
--   - NO se toca `anular_saf_lote_reversa()` / migration
--     `0113_saf_creditos_reversas.sql` (twin-bug #3, confirmado por lectura,
--     NO reproducido con datos reales — cambio SDD separado, decision
--     explicita de NO foldearlo aqui, Phase 0.3 de tasks.md).
--   - NO se cambia ninguna formula, clamp, ni tolerancia de redondeo del
--     saldo de lote — relocacion de timing pura.
--   - NO se toca `src/core/db/powersync/connector.ts`
--     (`IMMUTABLE_TABLES`/`ignoreDuplicates`) — el fix vive enteramente en
--     el timing del trigger de Postgres.
--
-- ROLLBACK: ver bloque comentado al final de este archivo — restaura
--   `consumir_saf_lote()` al cuerpo UNICO de 0105 (UPDATE re-inlineado) y
--   elimina el trigger/funcion AFTER nuevos.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BEFORE INSERT adelgazada: mantiene el FOR UPDATE lock, las excepciones
--    de lote-no-encontrado/sobregiro, y la asignacion de NEW.lote_saldo_*.
--    Byte-identico al bloque SELECT..asignacion de 0105 (lineas 113-128) —
--    se retira UNICAMENTE el `PERFORM set_config(...)` + el bloque
--    `UPDATE saf_creditos_lotes` (0105 lineas 130-135), relocados abajo en
--    consumir_saf_lote_after().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_saf_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_antes   NUMERIC(20,8);
  v_saldo_despues NUMERIC(20,8);
BEGIN
  -- FOR UPDATE: row lock explicito. Serializa consumidores concurrentes del
  -- MISMO lote por construccion. Este lock se mantiene hasta el FINAL DE LA
  -- TRANSACCION (no del statement) — Postgres lo garantiza — por lo que
  -- sigue vigente cuando el trigger AFTER (ver consumir_saf_lote_after() mas
  -- abajo) ejecuta su UPDATE sobre la misma fila, dentro de la misma
  -- transaccion. BYTE-IDENTICO a 0105, sin cambios por esta migracion (0122)
  -- — unicamente se retiro el side-effect UPDATE que vivia despues de este
  -- bloque, ahora relocado al AFTER.
  SELECT saldo_disponible_usd INTO v_saldo_antes
  FROM public.saf_creditos_lotes WHERE id = NEW.lote_id FOR UPDATE;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION 'Lote de credito SAF % no encontrado', NEW.lote_id USING ERRCODE = 'P0001';
  END IF;

  v_saldo_despues := v_saldo_antes - NEW.monto_aplicado_usd;
  IF v_saldo_despues < -0.005 THEN
    RAISE EXCEPTION 'Aplicacion ($%) excede el saldo disponible del lote ($%)',
      NEW.monto_aplicado_usd, v_saldo_antes USING ERRCODE = 'P0001';
  END IF;
  v_saldo_despues := GREATEST(0, v_saldo_despues);

  NEW.lote_saldo_antes_usd   := v_saldo_antes;
  NEW.lote_saldo_despues_usd := v_saldo_despues;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 2. AFTER INSERT nueva: contiene el side-effect UPDATE saf_creditos_lotes
--    relocado. Postgres NO dispara este trigger para filas descartadas por
--    ON CONFLICT DO NOTHING — ese es el fix (ver cabecera del archivo).
--    Lee NEW.lote_saldo_despues_usd (ya calculado+clamped en el BEFORE bajo
--    el FOR UPDATE lock, que sigue vigente aqui) en vez de re-SELECT — evita
--    duplicar la logica de clamp/excepcion en dos funciones (design.md
--    Decision #3). RETURN NULL es la convencion documentada para AFTER ROW
--    triggers (Postgres ignora el valor de retorno de un trigger AFTER ROW).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_saf_lote_after()
RETURNS TRIGGER AS $$
BEGIN
  -- CRITICAL: set context so validate_saf_lote_update allows este UPDATE.
  -- Movido junto con el UPDATE (antes vivia en el BEFORE, 0105 linea 130) —
  -- set_config(..., TRUE) es transaction-scoped, no statement-scoped, asi
  -- que setearlo aqui mismo, inmediatamente antes de su UPDATE consumidor,
  -- es funcionalmente identico (mismo razonamiento que design.md Decision #2,
  -- ya aplicado en 0121 para actualizar_saldo_cliente_after()).
  PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE);
  -- ===========================================================================
  -- BYTE-DIFF GATE (obligatorio, verificado por sdd-apply antes de entregar
  -- este cambio): el bloque `UPDATE public.saf_creditos_lotes ...` que sigue
  -- es IDENTICO al bloque equivalente de 0105 (lineas 131-135) MODULO la
  -- unica sustitucion intencional `v_saldo_despues` -> `NEW.lote_saldo_despues_usd`
  -- (la variable local del BEFORE ya no existe en esta funcion — su valor ya
  -- fue calculado y clamped en el BEFORE y viaja en la columna NEW
  -- persistida, que es la UNICA fuente de verdad disponible para el AFTER).
  -- CERO cambio de formula, CASE, o tolerancia. Verificacion real ejecutada:
  --   awk 'NR==131,NR==135' 0105_saf_creditos_aplicaciones.sql \
  --     | sed 's/v_saldo_despues/NEW.lote_saldo_despues_usd/g' \
  --     | grep -vE '^\s*--' > /tmp/0105_update_block_substituted.txt
  --   awk '/^  UPDATE public.saf_creditos_lotes$/,/WHERE id = NEW.lote_id;/' \
  --     0122_mover_consumir_saf_lote_a_after_insert.sql \
  --     | grep -vE '^\s*--' > /tmp/0122_update_block.txt
  --   diff /tmp/0105_update_block_substituted.txt /tmp/0122_update_block.txt
  --   md5sum /tmp/0105_update_block_substituted.txt /tmp/0122_update_block.txt
  -- RESULTADO: `diff` sin salida (SIN DIFERENCIAS tras aplicar la unica
  -- sustitucion declarada), ambos md5sum IDENTICOS. Ver tasks.md Phase 2
  -- tarea 2.3 y apply-progress para el log completo del comando ejecutado
  -- y su resultado durante el apply de este cambio.
  -- ===========================================================================
  UPDATE public.saf_creditos_lotes
  SET saldo_disponible_usd = NEW.lote_saldo_despues_usd,
      status = CASE WHEN NEW.lote_saldo_despues_usd <= 0.005 THEN 'AGOTADO' ELSE 'ACTIVO' END,
      updated_at = NOW()
  WHERE id = NEW.lote_id;

  RETURN NULL; -- AFTER ROW return value is ignored by Postgres; NULL is the documented convention.
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 3. Trigger declarations. Postgres no permite ALTER TRIGGER para cambiar
--    timing (BEFORE -> AFTER) — DROP + CREATE es obligatorio para ambos.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON public.saf_creditos_aplicaciones;
CREATE TRIGGER trg_consumir_saf_lote
  BEFORE INSERT ON public.saf_creditos_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote();

DROP TRIGGER IF EXISTS trg_consumir_saf_lote_after ON public.saf_creditos_aplicaciones;
CREATE TRIGGER trg_consumir_saf_lote_after
  AFTER INSERT ON public.saf_creditos_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote_after();

COMMIT;

-- =============================================================================
-- VERIFICACION MANUAL EN STAGING (owner — bloques BEGIN;...ROLLBACK;, cero
-- efecto persistente, reemplazar los placeholders <...> con IDs reales de un
-- cliente/empresa/usuario/venta de PRUEBA DESCARTABLE antes de ejecutar). Dos
-- bloques, en orden:
--   TC-SAF-LOTE-SINGLE-FIRE: regresion — un INSERT unico en
--     saf_creditos_aplicaciones debe producir EXACTAMENTE el mismo decremento
--     que la funcion vigente antes de 0122 (sin doble-conteo, sin cambio de
--     formula). Crea su propio lote/movimientos_cuenta de respaldo DESDE CERO
--     dentro del bloque (solo cliente/empresa/usuario/venta son placeholders
--     pre-existentes), igual que la verificacion manual original de 0105.
--   TC-SAF-LOTE-RETRY-SIMULADO: el fix — simula el reenvio exacto de
--     PowerSync (misma aplicacion id, ON CONFLICT DO NOTHING, 2 intentos en
--     "transacciones" separadas simuladas dentro del mismo DO block) y
--     confirma que el saldo del lote decrementa UNA SOLA VEZ, no 2 veces.
-- Ambos bloques usan DO $$ ... $$ con RAISE EXCEPTION como asercion
-- automatica (mismo patron que TC-UNICO-FIRE-MATRIX/TC-RETRY-SIMULADO de
-- 0121) — si alguna asercion falla, el bloque aborta con P0001 ANTES del
-- ROLLBACK final, dejando claro cual caso fallo.
-- =============================================================================

-- -- TC-SAF-LOTE-SINGLE-FIRE: lote nuevo con saldo=20, UNA aplicacion de 5 ->
-- -- esperado saldo_disponible_usd=15, status=ACTIVO (sin doble-conteo).
-- BEGIN;
--   DO $$
--   DECLARE
--     v_cliente       CONSTANT uuid := '<cliente-test>';
--     v_empresa       CONSTANT uuid := '<empresa-test>';
--     v_usuario       CONSTANT uuid := '<usuario-test>';
--     v_venta         CONSTANT uuid := '<venta-test>';
--     v_mov_safc      CONSTANT uuid := gen_random_uuid();
--     v_mov_saf       CONSTANT uuid := gen_random_uuid();
--     v_lote          CONSTANT uuid := gen_random_uuid();
--     v_aplicacion    CONSTANT uuid := gen_random_uuid();
--     v_saldo         NUMERIC(20,8);
--     v_status        TEXT;
--   BEGIN
--     -- Movimiento SAFC de respaldo (ancla de coexistencia requerida por
--     -- saf_creditos_lotes.movimiento_cuenta_id UNIQUE NOT NULL).
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_safc, v_empresa, v_cliente, 'SAFC', 'TC-SAF-LOTE-SINGLE-FIRE-SAFC',
--       20, 0, -20, now(), now(), v_usuario);
--
--     -- Lote disponible con saldo=20 (monto_original=saldo_disponible, lote nuevo).
--     INSERT INTO saf_creditos_lotes (id, empresa_id, cliente_id, movimiento_cuenta_id,
--       origen_tipo, origen_id, monto_original_usd, saldo_disponible_usd, moneda_origen,
--       tasa_origen, fecha, created_by)
--     VALUES (v_lote, v_empresa, v_cliente, v_mov_safc, 'VENTA', v_venta, 20, 20, 'USD',
--       36.50, now(), v_usuario);
--
--     -- Movimiento SAF de respaldo (ancla de coexistencia para la fila de aplicacion).
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_saf, v_empresa, v_cliente, 'SAF', 'TC-SAF-LOTE-SINGLE-FIRE-SAF',
--       5, 0, 5, now(), now(), v_usuario);
--
--     -- Aplicacion unica: consume 5 del lote de 20.
--     INSERT INTO saf_creditos_aplicaciones (id, empresa_id, cliente_id, lote_id, venta_id,
--       movimiento_cuenta_id, monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--       tasa_pago, fecha, created_by)
--     VALUES (v_aplicacion, v_empresa, v_cliente, v_lote, v_venta, v_mov_saf, 5,
--       0, 0,  -- IGNORADOS: el trigger BEFORE los SOBREESCRIBE
--       36.50, now(), v_usuario);
--
--     SELECT saldo_disponible_usd, status INTO v_saldo, v_status
--       FROM saf_creditos_lotes WHERE id = v_lote;
--     IF v_saldo <> 15 OR v_status <> 'ACTIVO' THEN
--       RAISE EXCEPTION 'TC-SAF-LOTE-SINGLE-FIRE fallo: saldo_disponible_usd=% status=% (esperado 15/ACTIVO)',
--         v_saldo, v_status;
--     END IF;
--
--     RAISE NOTICE 'TC-SAF-LOTE-SINGLE-FIRE: PASS (decremento unico de $5, sin regresion vs. 0105)';
--   END;
--   $$;
-- ROLLBACK;

-- -- TC-SAF-LOTE-RETRY-SIMULADO: el fix. Misma fila saf_creditos_aplicaciones
-- -- (mismo id) reenviada 2 veces (igual al patron real de PowerSync, obs
-- -- #6079, aplicado aqui a la tabla gemela), ON CONFLICT(id) DO NOTHING
-- -- descarta el reenvio -> el AFTER INSERT no debe disparar para ese reenvio,
-- -- el saldo del lote debe decrementar UNA SOLA VEZ (no 2x).
-- BEGIN;
--   DO $$
--   DECLARE
--     v_cliente       CONSTANT uuid := '<cliente-test>';
--     v_empresa       CONSTANT uuid := '<empresa-test>';
--     v_usuario       CONSTANT uuid := '<usuario-test>';
--     v_venta         CONSTANT uuid := '<venta-test>';
--     v_mov_safc      CONSTANT uuid := gen_random_uuid();
--     v_mov_saf       CONSTANT uuid := gen_random_uuid();
--     v_lote          CONSTANT uuid := gen_random_uuid();
--     v_aplicacion    CONSTANT uuid := gen_random_uuid(); -- MISMO id en los 2 intentos.
--     v_saldo         NUMERIC(20,8);
--     v_filas         INT;
--   BEGIN
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_safc, v_empresa, v_cliente, 'SAFC', 'TC-SAF-LOTE-RETRY-SAFC',
--       20, 0, -20, now(), now(), v_usuario);
--
--     INSERT INTO saf_creditos_lotes (id, empresa_id, cliente_id, movimiento_cuenta_id,
--       origen_tipo, origen_id, monto_original_usd, saldo_disponible_usd, moneda_origen,
--       tasa_origen, fecha, created_by)
--     VALUES (v_lote, v_empresa, v_cliente, v_mov_safc, 'VENTA', v_venta, 20, 20, 'USD',
--       36.50, now(), v_usuario);
--
--     INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, tipo, referencia,
--       monto, saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES (v_mov_saf, v_empresa, v_cliente, 'SAF', 'TC-SAF-LOTE-RETRY-SAF',
--       5, 0, 5, now(), now(), v_usuario);
--
--     -- Intento 1 (exitoso): BEFORE calcula lote_saldo_*, fila se inserta sin
--     -- conflicto, AFTER dispara -> lote decrementa $5.
--     INSERT INTO saf_creditos_aplicaciones (id, empresa_id, cliente_id, lote_id, venta_id,
--       movimiento_cuenta_id, monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--       tasa_pago, fecha, created_by)
--     VALUES (v_aplicacion, v_empresa, v_cliente, v_lote, v_venta, v_mov_saf, 5, 0, 0, 36.50, now(), v_usuario)
--     ON CONFLICT (id) DO NOTHING;
--
--     -- Intento 2 (reenvio, MISMO id): BEFORE dispara igual (inevitable, corre
--     -- para toda fila candidata, incluye el FOR UPDATE lock + calculo) pero
--     -- NEW se descarta -> conflicto detectado -> fila NO se inserta -> AFTER
--     -- NO dispara. Este es el fix.
--     INSERT INTO saf_creditos_aplicaciones (id, empresa_id, cliente_id, lote_id, venta_id,
--       movimiento_cuenta_id, monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--       tasa_pago, fecha, created_by)
--     VALUES (v_aplicacion, v_empresa, v_cliente, v_lote, v_venta, v_mov_saf, 5, 0, 0, 36.50, now(), v_usuario)
--     ON CONFLICT (id) DO NOTHING;
--
--     SELECT count(*) INTO v_filas FROM saf_creditos_aplicaciones WHERE id = v_aplicacion;
--     IF v_filas <> 1 THEN
--       RAISE EXCEPTION 'TC-SAF-LOTE-RETRY-SIMULADO fallo: % filas con el mismo id (esperado 1, ON CONFLICT no descarto el reenvio)', v_filas;
--     END IF;
--
--     SELECT saldo_disponible_usd INTO v_saldo FROM saf_creditos_lotes WHERE id = v_lote;
--     IF v_saldo <> 15 THEN
--       RAISE EXCEPTION 'TC-SAF-LOTE-RETRY-SIMULADO fallo: saldo_disponible_usd=% (esperado 15 — si da 10, el AFTER volvio a disparar en el reenvio descartado, bug NO corregido)', v_saldo;
--     END IF;
--
--     RAISE NOTICE 'TC-SAF-LOTE-RETRY-SIMULADO: PASS (1 fila, 1 solo decremento de $5 pese a 2 intentos de INSERT con el mismo id)';
--   END;
--   $$;
-- ROLLBACK;

-- =============================================================================
-- ROLLBACK DE ESTA MIGRACION (documentado, NO auto-ejecutado). Restaura
-- consumir_saf_lote() al cuerpo UNICO de 0105 (BEFORE con el UPDATE
-- re-inlineado) y elimina el trigger/funcion AFTER nuevos. Dry-run de este
-- bloque (BEGIN; <esto>; ROLLBACK;) debe confirmarse antes de mergear —
-- restaura 0105 byte-por-byte.
-- =============================================================================

-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_consumir_saf_lote_after ON public.saf_creditos_aplicaciones;
--   DROP FUNCTION IF EXISTS public.consumir_saf_lote_after();
--
--   CREATE OR REPLACE FUNCTION public.consumir_saf_lote()
--   RETURNS TRIGGER AS $$
--   DECLARE
--     v_saldo_antes   NUMERIC(20,8);
--     v_saldo_despues NUMERIC(20,8);
--   BEGIN
--     SELECT saldo_disponible_usd INTO v_saldo_antes
--     FROM public.saf_creditos_lotes WHERE id = NEW.lote_id FOR UPDATE;
--
--     IF v_saldo_antes IS NULL THEN
--       RAISE EXCEPTION 'Lote de credito SAF % no encontrado', NEW.lote_id USING ERRCODE = 'P0001';
--     END IF;
--
--     v_saldo_despues := v_saldo_antes - NEW.monto_aplicado_usd;
--     IF v_saldo_despues < -0.005 THEN
--       RAISE EXCEPTION 'Aplicacion ($%) excede el saldo disponible del lote ($%)',
--         NEW.monto_aplicado_usd, v_saldo_antes USING ERRCODE = 'P0001';
--     END IF;
--     v_saldo_despues := GREATEST(0, v_saldo_despues);
--
--     NEW.lote_saldo_antes_usd   := v_saldo_antes;
--     NEW.lote_saldo_despues_usd := v_saldo_despues;
--
--     PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE);
--     UPDATE public.saf_creditos_lotes
--     SET saldo_disponible_usd = v_saldo_despues,
--         status = CASE WHEN v_saldo_despues <= 0.005 THEN 'AGOTADO' ELSE 'ACTIVO' END,
--         updated_at = NOW()
--     WHERE id = NEW.lote_id;
--
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
--   DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON public.saf_creditos_aplicaciones;
--   CREATE TRIGGER trg_consumir_saf_lote
--     BEFORE INSERT ON public.saf_creditos_aplicaciones
--     FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote();
-- COMMIT;
