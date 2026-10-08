-- =============================================================================
-- Migration: 0105_saf_creditos_aplicaciones.sql
-- Created:   2026-10-07
-- Depends:   0104_saf_creditos_lotes.sql (FK lote_id, mismo PR)
--
-- PURPOSE:
--   Capa 2 del modelo "Lotes de Credito + Asignaciones" (design-v2.md §4).
--   Cada aplicacion es un evento append-only: cuanto se aplico de que lote
--   a que factura, con snapshot antes/despues del SALDO DEL LOTE (no del
--   cliente) calculado por el trigger de abajo, nunca confiado de la app
--   (a diferencia de FAC/PAG en movimientos_cuenta, que si confian en el
--   valor de la app por legado — aqui no hay legado que preservar, se hace
--   bien desde el dia uno).
--
--   Mental model: espejo exacto de movimientos_inventario para el kardex de
--   inventario FIFO (design-v2.md §1) — evento append-only con
--   saldo_antes/saldo_despues, 100% inmutable tras el INSERT.
--
--   UNICO lugar que muta saf_creditos_lotes.saldo_disponible_usd/status: el
--   trigger consumir_saf_lote() de abajo, via
--   set_config('clarapos.trigger_context','saf_aplicacion',TRUE) que
--   autoriza el UPDATE contra el trigger validate_saf_lote_update() de 0104.
--
--   Guardia de sobregiro a nivel de base de datos: si el gate de la app
--   (igual que hoy valida contra clientes.saf_disponible) tuviera un bug,
--   este trigger RAISE excepcion antes de dejar un lote en negativo —
--   defensa en profundidad, igual que la asercion SAF de
--   actualizar_saldo_cliente() (0088, linea 96-100) que ya existe para el
--   ledger de clientes.
--
-- DEVIATION FROM design-v2.md (documentar, no silenciar):
--   Misma desviacion que 0104_saf_creditos_lotes.sql: las policies SELECT/
--   INSERT usan `current_empresa_id()` en vez del `USING (true)` /
--   `WITH CHECK (true)` literal de design-v2.md §4, por el mismo motivo
--   (precedente actual del codebase + BOLA/IDOR del skill de Supabase). El
--   resto (append-only, sin UPDATE, sin DELETE — precedente exacto
--   import_log_det de 0098) se implementa exactamente como lo especifica
--   design-v2.md.
--
--   `saf_creditos_aplicaciones` entra a IMMUTABLE_TABLES en connector.ts
--   (fuera de alcance de este PR — ver tasks-v2.md Fase 2) no porque tenga
--   un trigger bloqueante de UPDATE (no lo tiene, solo falta la policy),
--   sino para que un PUT reintentado de PowerSync use
--   INSERT ... ON CONFLICT DO NOTHING en vez de DO UPDATE — mismo
--   comentario que ya existe ahi para import_log/import_log_det.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON saf_creditos_aplicaciones;
--   DROP FUNCTION IF EXISTS consumir_saf_lote();
--   DROP TABLE IF EXISTS saf_creditos_aplicaciones;
--   -- Debe ejecutarse ANTES de revertir 0104 (FK lote_id -> saf_creditos_lotes.id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saf_creditos_aplicaciones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id),
  cliente_id              UUID NOT NULL REFERENCES public.clientes(id),  -- denormalizado del lote, mismo patron que ajustes_det denormaliza producto/deposito
  lote_id                 UUID NOT NULL REFERENCES public.saf_creditos_lotes(id),
  venta_id                UUID NOT NULL REFERENCES public.ventas(id),

  -- Anclaje de coexistencia: la fila SAF (consumo) de este evento de aplicacion.
  movimiento_cuenta_id    UUID NOT NULL REFERENCES public.movimientos_cuenta(id),

  monto_aplicado_usd      NUMERIC(20,8) NOT NULL CHECK (monto_aplicado_usd > 0),

  -- Snapshot "antes/despues" del LOTE en el momento de esta aplicacion.
  -- Calculado por el trigger consumir_saf_lote() de abajo, NO confiado de
  -- la app.
  lote_saldo_antes_usd    NUMERIC(20,8) NOT NULL,
  lote_saldo_despues_usd  NUMERIC(20,8) NOT NULL,

  tasa_pago               NUMERIC(20,8) NOT NULL,
  fecha                   TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_saf_aplic_venta
  ON public.saf_creditos_aplicaciones (venta_id);     -- "¿se aplico SAF a esta factura?" (design-v2.md Pregunta 9)
CREATE INDEX IF NOT EXISTS idx_saf_aplic_lote
  ON public.saf_creditos_aplicaciones (lote_id);      -- auditoria: "¿que consumio este lote?"
CREATE INDEX IF NOT EXISTS idx_saf_aplic_empresa
  ON public.saf_creditos_aplicaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_saf_aplic_cliente
  ON public.saf_creditos_aplicaciones (cliente_id);

-- RLS — 100% append-only (precedente exacto import_log_det, 0098) --------
ALTER TABLE public.saf_creditos_aplicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON public.saf_creditos_aplicaciones;
CREATE POLICY "select_own_empresa" ON public.saf_creditos_aplicaciones FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON public.saf_creditos_aplicaciones;
CREATE POLICY "insert_own_empresa" ON public.saf_creditos_aplicaciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin UPDATE, sin DELETE. Ningun trigger de inmutabilidad adicional
-- necesario (a diferencia de movimientos_cuenta/trg_mov_cuenta_no_update):
-- sin policy UPDATE, un PUT reintentado de PowerSync hace no-op (0 filas),
-- no levanta P0001 — identico a import_log_det.

-- Trigger de consumo (unico lugar que muta saf_creditos_lotes) -----------
CREATE OR REPLACE FUNCTION public.consumir_saf_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_antes   NUMERIC(20,8);
  v_saldo_despues NUMERIC(20,8);
BEGIN
  -- FOR UPDATE: row lock explicito. Serializa consumidores concurrentes del
  -- MISMO lote por construccion — misma garantia que el UPDATE directo de
  -- 0102 para saf_disponible, solo que aqui el lock es explicito porque el
  -- UPDATE ocurre en una tabla distinta a la del INSERT que lo dispara.
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

  PERFORM set_config('clarapos.trigger_context', 'saf_aplicacion', TRUE);
  UPDATE public.saf_creditos_lotes
  SET saldo_disponible_usd = v_saldo_despues,
      status = CASE WHEN v_saldo_despues <= 0.005 THEN 'AGOTADO' ELSE 'ACTIVO' END,
      updated_at = NOW()
  WHERE id = NEW.lote_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumir_saf_lote ON public.saf_creditos_aplicaciones;
CREATE TRIGGER trg_consumir_saf_lote BEFORE INSERT ON public.saf_creditos_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.consumir_saf_lote();

-- PowerSync publication (patron idempotente, ver 0098) -------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'saf_creditos_aplicaciones'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.saf_creditos_aplicaciones;
  END IF;
END $$;

-- =============================================================================
-- VERIFICACION MANUAL (owner, ClaraPos-Staging) — tasks 1.2 y 1.3 de tasks-v2.md
-- Esta sesion no tiene credenciales de Postgres (igual que 0101-0103): no se
-- puede ejecutar aqui. Requiere haber corrido el Paso 1 de la verificacion
-- de 0104 primero (o crear un lote nuevo con saldo_disponible_usd = 100),
-- y una fila ventas/movimientos_cuenta tipo SAF de prueba. Reemplazar los
-- placeholders <...> con IDs reales.
--
-- Paso 1 — Aplicacion dentro del limite (consume 30 de un lote con 100):
--   BEGIN;
--     INSERT INTO saf_creditos_aplicaciones
--       (id, empresa_id, cliente_id, lote_id, venta_id, movimiento_cuenta_id,
--        monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--        tasa_pago, fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<lote-test-saldo-100>', '<venta-test>', '<movimiento-cuenta-saf-test>',
--        30,
--        0, 0,  -- IGNORADOS: el trigger los SOBREESCRIBE con los valores reales
--        36.50, now(), '<usuario-test>');
--     -- Debe insertar 1 fila. El trigger escribe lote_saldo_antes_usd=100,
--     -- lote_saldo_despues_usd=70 (sobreescribiendo los 0/0 de arriba).
--     SELECT lote_saldo_antes_usd, lote_saldo_despues_usd
--       FROM saf_creditos_aplicaciones WHERE lote_id = '<lote-test-saldo-100>';
--     -- Esperado: 100 | 70
--     SELECT saldo_disponible_usd, status FROM saf_creditos_lotes
--       WHERE id = '<lote-test-saldo-100>';
--     -- Esperado: 70 | ACTIVO
--
-- Paso 2 — Sobregiro BLOQUEADO (el lote ahora tiene 70, se intenta aplicar 100):
--     INSERT INTO saf_creditos_aplicaciones
--       (id, empresa_id, cliente_id, lote_id, venta_id, movimiento_cuenta_id,
--        monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
--        tasa_pago, fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<lote-test-saldo-100>', '<otra-venta-test>', '<otro-movimiento-cuenta-saf-test>',
--        100, 0, 0, 36.50, now(), '<usuario-test>');
--     -- Esperado: ERROR P0001 'Aplicacion ($100.00000000) excede el saldo
--     -- disponible del lote ($70.00000000)'. Transaccion abortada
--     -- automaticamente; ROLLBACK de abajo cierra la sesion sin efecto
--     -- persistente.
--   ROLLBACK;
--
-- Paso 3 — Invariante de reconciliacion (correr en cualquier momento, fuera
-- de un BEGIN/ROLLBACK, es solo lectura — 0 filas esperadas siempre):
--   SELECT l.id, l.monto_original_usd, l.saldo_disponible_usd,
--          l.monto_original_usd - COALESCE(SUM(a.monto_aplicado_usd), 0) AS saldo_calculado
--   FROM saf_creditos_lotes l
--   LEFT JOIN saf_creditos_aplicaciones a ON a.lote_id = l.id
--   GROUP BY l.id, l.monto_original_usd, l.saldo_disponible_usd
--   HAVING ABS(l.saldo_disponible_usd - (l.monto_original_usd - COALESCE(SUM(a.monto_aplicado_usd), 0))) > 0.005;
--   -- Esperado: 0 filas (ningun lote con mismatch entre saldo materializado
--   -- y saldo recalculado desde el historial de aplicaciones).
-- =============================================================================
