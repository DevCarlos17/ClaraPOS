-- =============================================================================
-- Migration: 0112_pagos_aplicaciones.sql
-- Created:   2026-10-19
-- Depends:   pagos, ventas, clientes, empresas, usuarios (todas preexistentes)
--
-- PURPOSE:
--   Capa 2 de `cxc-ledger-saldos-redesign` (design.md, cxc-pagos-aplicaciones):
--   auditoria per-invoice append-only de como cada `pago` (abono) se aplica a
--   una factura, mirror EXACTO de `saf_creditos_aplicaciones`
--   (migrations/0105) pero SIN su trigger — aqui no hay un "lote" padre cuyo
--   saldo haya que proteger con un UPDATE disparado desde este INSERT. El
--   snapshot antes/despues (`saldo_venta_antes_usd`/`saldo_venta_despues_usd`)
--   lo provee la app, confiado de la misma forma que FAC/PAG ya confian en
--   `movimientos_cuenta.saldo_anterior`/`saldo_nuevo` (legado pre-SAF) — pura
--   auditoria app-trusted, no un gate de integridad.
--
--   Cierra el gap donde un abono global FIFO (`registrarAbonoGlobal`) escribe
--   N filas `pagos` pero solo 1 fila agregada `movimientos_cuenta` tipo PAG,
--   sin trazabilidad formal antes/despues por factura.
--
--   Arranca VACIA — sin backfill (design.md Q2, mismo precedente que 0105
--   para `saf_creditos_lotes`: "arranca vacio, ningun lote historico se
--   reconstruye"). Reconstruir desde `pagos` historicos requeriria ledger
--   replay cronologico exacto por venta (riesgo explicitamente descartado,
--   ver Approach B en el proposal) — los abonos historicos mantienen su
--   auditoria actual (`movimientos_cuenta` PAG agregado + filas `pagos`), un
--   gap documentado y acotado, no un riesgo de correctitud.
--
-- DEVIATION FROM saf_creditos_aplicaciones (0105) (documentar, no silenciar):
--   1. SIN trigger: no existe un "lote" cuyo saldo este INSERT deba mutar.
--      El `venta_id`/`saldo_pend_usd` de la factura ya se actualiza en la
--      MISMA writeTransaction via el UPDATE ventas existente — este INSERT
--      solo registra el snapshot que la app ya calculo en ese mismo paso,
--      nunca recalculado aqui.
--   2. Mismas policies SELECT/INSERT via `current_empresa_id()` (mismo
--      motivo que 0104/0105: precedente del codebase + BOLA/IDOR del skill
--      de Supabase). Append-only (sin UPDATE, sin DELETE) — precedente
--      exacto import_log_det (0098) / saf_creditos_aplicaciones (0105).
--
--   `pagos_aplicaciones` entra a IMMUTABLE_TABLES en connector.ts (mismo
--   motivo que saf_creditos_aplicaciones: no por un trigger bloqueante de
--   UPDATE, sino para que un PUT reintentado de PowerSync use
--   INSERT ... ON CONFLICT DO NOTHING en vez de DO UPDATE).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS pagos_aplicaciones;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pagos_aplicaciones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id),
  cliente_id              UUID NOT NULL REFERENCES public.clientes(id),  -- denormalizado, mismo patron saf_creditos_aplicaciones
  pago_id                 UUID NOT NULL REFERENCES public.pagos(id),
  venta_id                UUID NOT NULL REFERENCES public.ventas(id),

  monto_aplicado_usd      NUMERIC(20,8) NOT NULL CHECK (monto_aplicado_usd > 0),

  -- Snapshot "antes/despues" del SALDO DE LA FACTURA, app-trusted (sin
  -- trigger recalculador — ver DEVIATION arriba).
  saldo_venta_antes_usd   NUMERIC(20,8) NOT NULL,
  saldo_venta_despues_usd NUMERIC(20,8) NOT NULL,

  fecha                   TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_pagos_aplic_pago
  ON public.pagos_aplicaciones (pago_id);     -- base de lectura para cxc-reversa-pago-saf (design.md §Read function)
CREATE INDEX IF NOT EXISTS idx_pagos_aplic_venta
  ON public.pagos_aplicaciones (venta_id);    -- "¿se aplico este pago a esta factura?"
CREATE INDEX IF NOT EXISTS idx_pagos_aplic_empresa
  ON public.pagos_aplicaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagos_aplic_cliente
  ON public.pagos_aplicaciones (cliente_id);

-- RLS — 100% append-only (precedente exacto import_log_det 0098 / saf_creditos_aplicaciones 0105) --------
ALTER TABLE public.pagos_aplicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON public.pagos_aplicaciones;
CREATE POLICY "select_own_empresa" ON public.pagos_aplicaciones FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON public.pagos_aplicaciones;
CREATE POLICY "insert_own_empresa" ON public.pagos_aplicaciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin UPDATE, sin DELETE, sin trigger de inmutabilidad adicional: sin
-- policy UPDATE, un PUT reintentado de PowerSync hace no-op (0 filas), no
-- levanta P0001 — identico a import_log_det / saf_creditos_aplicaciones.

-- PowerSync publication (patron idempotente, ver 0098/0105) -------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'pagos_aplicaciones'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.pagos_aplicaciones;
  END IF;
END $$;

-- =============================================================================
-- VERIFICACION MANUAL (owner, ClaraPos-Staging) — tasks.md 2.8
-- Esta sesion no tiene credenciales de Postgres: no se puede ejecutar aqui.
-- La tabla arranca VACIA (design.md Q2, sin backfill) — no hay invariante de
-- reconciliacion que correr, solo confirmar que la tabla existe y el modelo
-- append-only funciona. Reemplazar los placeholders <...> con IDs reales.
--
-- Paso 1 — Confirmar existencia + insertar fila de prueba:
--   BEGIN;
--     INSERT INTO pagos_aplicaciones
--       (id, empresa_id, cliente_id, pago_id, venta_id,
--        monto_aplicado_usd, saldo_venta_antes_usd, saldo_venta_despues_usd,
--        fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<pago-test>', '<venta-test>',
--        30, 100, 70, now(), '<usuario-test>');
--     -- Debe insertar 1 fila sin error.
--     SELECT * FROM pagos_aplicaciones WHERE pago_id = '<pago-test>';
--   ROLLBACK; -- descarta la fila de prueba, no deja rastro
--
-- Paso 2 — Confirmar que UPDATE/DELETE estan bloqueados (sin policy):
--   -- Repetir el INSERT del Paso 1 SIN envolver en BEGIN/ROLLBACK (persiste),
--   -- luego intentar:
--   UPDATE pagos_aplicaciones SET monto_aplicado_usd = 999 WHERE pago_id = '<pago-test>';
--   -- Esperado: 0 filas afectadas (no hay policy UPDATE que lo permita).
--   DELETE FROM pagos_aplicaciones WHERE pago_id = '<pago-test>';
--   -- Esperado: 0 filas afectadas (no hay policy DELETE que lo permita).
--   -- Limpiar manualmente la fila de prueba si quedo persistida (requiere
--   -- acceso directo como owner/superuser, ya que RLS normal no permite DELETE).
-- =============================================================================
