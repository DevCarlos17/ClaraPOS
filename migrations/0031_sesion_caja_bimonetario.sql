-- Migration 0031: Fondo de apertura bimonetario en sesiones_caja
-- Agrega columna para registrar el fondo inicial en Bolivares ademas del USD

ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS monto_apertura_bs NUMERIC(15,2) NOT NULL DEFAULT 0;

