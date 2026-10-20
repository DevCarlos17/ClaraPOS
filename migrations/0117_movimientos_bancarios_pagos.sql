-- =============================================================================
-- Migration: 0117_movimientos_bancarios_pagos.sql
-- Created:   2026-10-20
-- Depends:   movimientos_bancarios, pagos, empresas, usuarios (todas preexistentes)
--
-- PURPOSE:
--   `trazabilidad-ingreso-pagos-directo` (design.md): tabla puente append-only
--   que formaliza la trazabilidad entre un INGRESO bancario de abono directo
--   (`movimientos_bancarios.origen='TRANSFERENCIA_CLIENTE'`,
--   `deposito_directo=1`) y el/los `pago_id` que representa. Hoy ese INGRESO
--   no tiene FK formal hacia `pagos` — esta tabla cierra ese gap SOLO para el
--   camino directo.
--
--   Mirror EXACTO de `migrations/0112_pagos_aplicaciones.sql`: SIN trigger
--   (pura auditoria app-trusted, igual que `pagos_aplicaciones` confia en
--   los snapshots de la misma writeTransaction que ya actualiza
--   `bancos_empresa`/`pagos`), SIN `cliente_id` denormalizado (YAGNI — ningun
--   read-path de este change lo necesita; lecturas futuras hacen join
--   `pago_id -> pagos.cliente_id`).
--
--   Fan-in real: 1 INGRESO puede tener N `pago_id` (abono global FIFO sobre
--   varias facturas, mas opcionalmente 1 fila de anticipo/excedente) — por
--   eso es una tabla join y no una columna suelta en `movimientos_bancarios`.
--
--   Arranca VACIA — sin backfill (mismo precedente que 0105/0112: replay de
--   ledger historico explicitamente descartado como riesgo). Ingresos
--   pre-migracion quedan no-reversables via esta trazabilidad.
--
-- DEVIATION FROM pagos_aplicaciones (0112): ninguna estructural. Mismas
-- policies SELECT/INSERT via `current_empresa_id()`, append-only (sin
-- UPDATE, sin DELETE), sin trigger de inmutabilidad adicional.
--
--   `movimientos_bancarios_pagos` entra a IMMUTABLE_TABLES en connector.ts
--   (mismo motivo que pagos_aplicaciones/saf_creditos_aplicaciones: no por
--   un trigger bloqueante de UPDATE, sino para que un PUT reintentado de
--   PowerSync use INSERT ... ON CONFLICT DO NOTHING en vez de DO UPDATE).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS movimientos_bancarios_pagos;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.movimientos_bancarios_pagos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES public.empresas(id),
  ingreso_id           UUID NOT NULL REFERENCES public.movimientos_bancarios(id),
  pago_id              UUID NOT NULL REFERENCES public.pagos(id),

  monto_aplicado_usd   NUMERIC(20,8) NOT NULL CHECK (monto_aplicado_usd > 0),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_ingreso
  ON public.movimientos_bancarios_pagos (ingreso_id);  -- "¿que pagos formalizo este ingreso?"
CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_pago
  ON public.movimientos_bancarios_pagos (pago_id);     -- "¿que ingreso formalizo este pago?"
CREATE INDEX IF NOT EXISTS idx_mov_banc_pagos_empresa
  ON public.movimientos_bancarios_pagos (empresa_id);

-- RLS — 100% append-only (precedente exacto pagos_aplicaciones 0112 / saf_creditos_aplicaciones 0105) --------
ALTER TABLE public.movimientos_bancarios_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON public.movimientos_bancarios_pagos;
CREATE POLICY "select_own_empresa" ON public.movimientos_bancarios_pagos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON public.movimientos_bancarios_pagos;
CREATE POLICY "insert_own_empresa" ON public.movimientos_bancarios_pagos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin UPDATE, sin DELETE, sin trigger de inmutabilidad adicional: sin
-- policy UPDATE, un PUT reintentado de PowerSync hace no-op (0 filas), no
-- levanta P0001 — identico a pagos_aplicaciones / saf_creditos_aplicaciones.

-- PowerSync publication (patron idempotente, ver 0098/0112) -------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'movimientos_bancarios_pagos'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.movimientos_bancarios_pagos;
  END IF;
END $$;

-- =============================================================================
-- VERIFICACION MANUAL (owner, ClaraPos-Staging) — tasks.md 0a-schema.9
-- Esta sesion no tiene credenciales de Postgres: no se puede ejecutar aqui.
-- La tabla arranca VACIA (sin backfill) — no hay invariante de reconciliacion
-- que correr, solo confirmar que la tabla existe y el modelo append-only
-- funciona. Reemplazar los placeholders <...> con IDs reales.
--
-- Paso 1 — Confirmar existencia + insertar fila de prueba:
--   BEGIN;
--     INSERT INTO movimientos_bancarios_pagos
--       (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>',
--        '<movimiento-bancario-test>', '<pago-test>',
--        100, '<usuario-test>');
--     -- Debe insertar 1 fila sin error.
--     SELECT * FROM movimientos_bancarios_pagos WHERE pago_id = '<pago-test>';
--   ROLLBACK; -- descarta la fila de prueba, no deja rastro
--
-- Paso 2 — Confirmar que UPDATE/DELETE estan bloqueados (sin policy):
--   -- Repetir el INSERT del Paso 1 SIN envolver en BEGIN/ROLLBACK (persiste),
--   -- luego intentar:
--   UPDATE movimientos_bancarios_pagos SET monto_aplicado_usd = 999 WHERE pago_id = '<pago-test>';
--   -- Esperado: 0 filas afectadas (no hay policy UPDATE que lo permita).
--   DELETE FROM movimientos_bancarios_pagos WHERE pago_id = '<pago-test>';
--   -- Esperado: 0 filas afectadas (no hay policy DELETE que lo permita).
--   -- Limpiar manualmente la fila de prueba si quedo persistida (requiere
--   -- acceso directo como owner/superuser, ya que RLS normal no permite DELETE).
-- =============================================================================
