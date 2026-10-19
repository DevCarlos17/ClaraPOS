-- =============================================================================
-- Migration: 0113_saf_creditos_reversas.sql
-- Created:   2026-10-19
-- Depends:   0104_saf_creditos_lotes.sql (FK lote_id; el guard string
--              'saf_aplicacion' de set_config se REUSA, no se inventa uno
--              nuevo — ver validate_saf_lote_update() en 0104, lineas 137-141:
--              solo verifica el VALOR del set_config, nunca de que
--              trigger/tabla proviene)
--            0105_saf_creditos_aplicaciones.sql (patron consumir_saf_lote()
--              espejado abajo por anular_saf_lote_reversa(), misma estructura:
--              FOR UPDATE lock, columnas trigger-computed antes/despues)
--
-- PURPOSE (openspec/changes/cxc-ledger-saldos-redesign/design.md Q4):
--   Capa de "reverso" del modelo Lotes+Aplicaciones. Cuando se revierte un
--   `pago` que genero un lote SAF (saf_creditos_lotes.origen_tipo='PAGO')
--   con remanente SIN consumir (saldo_disponible_usd > 0 al momento del
--   reverso), esta tabla registra el evento de anulacion de ese remanente —
--   append-only, mismo mental model que saf_creditos_aplicaciones (0105)
--   pero en direccion inversa: en vez de CONSUMIR saldo del lote, lo ANULA
--   de una sola vez.
--
--   Contrato de diseño (spec cxc-reversa-pago-saf, Requirement "Compensation
--   without row mutation"): el reverso de un lote parcial o totalmente
--   consumido NUNCA actualiza ni borra las filas historicas de
--   saf_creditos_lotes/saf_creditos_aplicaciones ya existentes — ambas
--   permanecen byte-identicas despues del reverso (tanto el consumo
--   original como el reverso quedan visibles en el historial). Esta tabla +
--   su trigger son el UNICO mecanismo autorizado para forzar
--   saldo_disponible_usd=0/status='AGOTADO' en un lote reversado.
--
--   Un lote TOTALMENTE consumido (saldo_disponible_usd ya en 0 al momento
--   del reverso) NO genera fila aqui — nada que anular (design.md linea
--   105-106: "Only inserted when the lote's remainder > 0 at reversal
--   time").
--
--   lote_id es UNIQUE: maximo 1 reverso por lote, enforced a nivel DB (el
--   pago que origino un lote solo puede revertirse una vez, por
--   construccion de registrarReversoAbono — Slice 3b-iii, fuera de alcance
--   de este archivo).
--
--   movimiento_cuenta_id es UNIQUE: ancla 1:1 con la fila 'SAFR' que este
--   reverso empareja (mismo patron de "ancla de coexistencia" que
--   saf_creditos_lotes.movimiento_cuenta_id ancla su fila 'SAFC', 0104).
--
-- NO TRIGGER LOGIC DE ESCRITURA AQUI (fuera de alcance de este slice): esta
-- migracion es SOLO infraestructura de schema/trigger-de-lote. La escritura
-- real de `reversarPagoSafEnTx` (que hace el INSERT en esta tabla + el
-- movimiento SAFR emparejado) es la Slice 3b-ii (ver tasks.md de
-- cxc-ledger-saldos-redesign), NO este archivo. El tipo 'SAFR' en si lo
-- habilita 0114 (mismo PR, siguiente archivo).
--
-- DEVIATION FROM design.md: ninguna. Mismo patron RLS current_empresa_id()
-- que 0104/0105 (ver su propia nota DEVIATION en esos archivos, misma
-- justificacion BOLA/IDOR del skill de Supabase).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_anular_saf_lote_reversa ON saf_creditos_reversas;
--   DROP FUNCTION IF EXISTS anular_saf_lote_reversa();
--   DROP TABLE IF EXISTS saf_creditos_reversas;
--   -- Debe ejecutarse ANTES de revertir 0104 (FK lote_id -> saf_creditos_lotes.id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saf_creditos_reversas (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                    UUID NOT NULL REFERENCES public.empresas(id),
  cliente_id                    UUID NOT NULL REFERENCES public.clientes(id),

  -- 1 reverso por lote, enforced por la DB.
  lote_id                       UUID NOT NULL UNIQUE REFERENCES public.saf_creditos_lotes(id),
  pago_id                       UUID NOT NULL REFERENCES public.pagos(id),

  -- Ancla de coexistencia: la fila 'SAFR' que este reverso empareja.
  movimiento_cuenta_id          UUID NOT NULL UNIQUE REFERENCES public.movimientos_cuenta(id),

  saldo_disponible_anulado_usd  NUMERIC(20,8) NOT NULL CHECK (saldo_disponible_anulado_usd > 0),

  -- Snapshot "antes/despues" del LOTE en el momento de este reverso.
  -- Calculado por el trigger anular_saf_lote_reversa() de abajo, NO
  -- confiado de la app (mismo patron que lote_saldo_antes/despues_usd en
  -- saf_creditos_aplicaciones, 0105).
  lote_saldo_antes_usd          NUMERIC(20,8) NOT NULL,
  lote_saldo_despues_usd        NUMERIC(20,8) NOT NULL,  -- siempre 0 por construccion

  fecha                         TIMESTAMPTZ NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                    UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_safr_pago
  ON public.saf_creditos_reversas (pago_id);     -- "¿se reverso el pago que genero este lote?"
CREATE INDEX IF NOT EXISTS idx_safr_empresa
  ON public.saf_creditos_reversas (empresa_id);
-- lote_id y movimiento_cuenta_id ya tienen indice implicito via su propia
-- constraint UNIQUE — no se duplica aqui.

-- RLS — 100% append-only (precedente exacto 0105) ------------------------
ALTER TABLE public.saf_creditos_reversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON public.saf_creditos_reversas;
CREATE POLICY "select_own_empresa" ON public.saf_creditos_reversas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON public.saf_creditos_reversas;
CREATE POLICY "insert_own_empresa" ON public.saf_creditos_reversas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin UPDATE, sin DELETE. Ningun trigger de inmutabilidad adicional
-- necesario (a diferencia de movimientos_cuenta/trg_mov_cuenta_no_update):
-- sin policy UPDATE, un PUT reintentado de PowerSync hace no-op (0 filas),
-- no levanta P0001 — identico a saf_creditos_aplicaciones/pagos_aplicaciones.

-- Trigger de anulacion (unico lugar que fuerza saldo_disponible_usd=0 y
-- status='AGOTADO' en un lote reversado) — espejo exacto de
-- consumir_saf_lote() (0105), pero en direccion de anulacion TOTAL del
-- remanente en vez de consumo parcial -------------------------------------
CREATE OR REPLACE FUNCTION public.anular_saf_lote_reversa()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_actual NUMERIC(20,8);
BEGIN
  -- FOR UPDATE: row lock explicito, misma garantia que consumir_saf_lote()
  -- (0105) — serializa consumos/reversos concurrentes del MISMO lote por
  -- construccion.
  SELECT saldo_disponible_usd INTO v_saldo_actual
  FROM public.saf_creditos_lotes WHERE id = NEW.lote_id FOR UPDATE;

  IF v_saldo_actual IS NULL THEN
    RAISE EXCEPTION 'Lote de credito SAF % no encontrado', NEW.lote_id USING ERRCODE = 'P0001';
  END IF;

  -- Guardia de desincronizacion a nivel de base de datos: el monto a anular
  -- DEBE coincidir con el saldo disponible real del lote al momento de la
  -- transaccion (tolerancia 0.005, igual que consumir_saf_lote). Si el gate
  -- de la app (Slice 3b-ii) tuviera un bug de lectura obsoleta, este trigger
  -- RAISE antes de dejar el lote en un estado inconsistente — defensa en
  -- profundidad, mismo razonamiento que el guard de sobregiro de 0105.
  IF ABS(v_saldo_actual - NEW.saldo_disponible_anulado_usd) > 0.005 THEN
    RAISE EXCEPTION 'El saldo a anular ($%) no coincide con el saldo disponible actual del lote ($%)',
      NEW.saldo_disponible_anulado_usd, v_saldo_actual USING ERRCODE = 'P0001';
  END IF;

  NEW.lote_saldo_antes_usd   := v_saldo_actual;
  NEW.lote_saldo_despues_usd := 0;

  PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE);
  UPDATE public.saf_creditos_lotes
  SET saldo_disponible_usd = 0,
      status = 'AGOTADO',
      updated_at = NOW()
  WHERE id = NEW.lote_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anular_saf_lote_reversa ON public.saf_creditos_reversas;
CREATE TRIGGER trg_anular_saf_lote_reversa BEFORE INSERT ON public.saf_creditos_reversas
  FOR EACH ROW EXECUTE FUNCTION public.anular_saf_lote_reversa();

-- PowerSync publication (patron idempotente, ver 0098/0104/0105) ----------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'saf_creditos_reversas'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.saf_creditos_reversas;
  END IF;
END $$;

-- =============================================================================
-- VERIFICACION MANUAL (owner, ClaraPos-Staging) — task 3a.6 de tasks.md de
-- cxc-ledger-saldos-redesign. Esta sesion no tiene credenciales de Postgres
-- (igual que 0101-0105): no se puede ejecutar aqui. Requiere un lote SAF de
-- prueba existente con saldo_disponible_usd > 0 (crear uno via el Paso 1 de
-- 0104 si no existe) y haber aplicado 0114 PRIMERO (amplia el CHECK de
-- movimientos_cuenta para aceptar 'SAFR', usado en el movimiento de prueba
-- de abajo). Reemplazar los placeholders <...> con IDs reales.
--
-- Paso 1 — Reverso valido (lote con $40 disponible, se anula completo):
--   BEGIN;
--     INSERT INTO saf_creditos_reversas
--       (id, empresa_id, cliente_id, lote_id, pago_id, movimiento_cuenta_id,
--        saldo_disponible_anulado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--        fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<lote-test-saldo-40>', '<pago-test>', '<movimiento-cuenta-safr-test>',
--        40,
--        0, 0,  -- IGNORADOS: el trigger los SOBREESCRIBE con los valores reales
--        now(), '<usuario-test>');
--     -- Debe insertar 1 fila. El trigger escribe lote_saldo_antes_usd=40,
--     -- lote_saldo_despues_usd=0 (sobreescribiendo los 0/0 de arriba).
--     SELECT lote_saldo_antes_usd, lote_saldo_despues_usd
--       FROM saf_creditos_reversas WHERE lote_id = '<lote-test-saldo-40>';
--     -- Esperado: 40 | 0
--     SELECT saldo_disponible_usd, status FROM saf_creditos_lotes
--       WHERE id = '<lote-test-saldo-40>';
--     -- Esperado: 0 | AGOTADO
--
-- Paso 2 — Mismatch BLOQUEADO (el lote ya quedo en 0 tras el Paso 1; se
-- intenta anular $40 de nuevo con otra fila, mismo lote):
--     INSERT INTO saf_creditos_reversas
--       (id, empresa_id, cliente_id, lote_id, pago_id, movimiento_cuenta_id,
--        saldo_disponible_anulado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--        fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<lote-test-saldo-40>', '<otro-pago-test>', '<otro-movimiento-cuenta-safr-test>',
--        40, 0, 0, now(), '<usuario-test>');
--     -- Esperado: ERROR P0001 'El saldo a anular ($40.00000000) no coincide
--     -- con el saldo disponible actual del lote ($0.00000000)' — el trigger
--     -- corre ANTES de que la constraint UNIQUE(lote_id) pueda rechazar el
--     -- duplicado, asi que este es el error que se observa primero.
--     -- Transaccion abortada automaticamente; el ROLLBACK de abajo cierra
--     -- la sesion sin efecto persistente.
--   ROLLBACK;
-- =============================================================================
