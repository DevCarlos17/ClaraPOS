-- Migration: pos-tesoreria-integration — Step 1: extend traspasos_tesoreria
-- Adds sesion_caja_id to enable tracing POS↔Tesorería atomic transfers back to their originating session.

ALTER TABLE traspasos_tesoreria
  ADD COLUMN IF NOT EXISTS sesion_caja_id TEXT REFERENCES sesiones_caja(id);
