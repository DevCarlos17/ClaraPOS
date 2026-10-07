-- =============================================================================
-- Migration: 0101_clientes_saf_disponible_column.sql
-- Created:   2026-10-07
-- Depends:   0090_add_safc_tipo_movimientos_cuenta.sql (tipo 'SAFC' existe)
--
-- PURPOSE:
--   Slice 1 de saf-snapshot-y-trazabilidad. Agrega la columna snapshot
--   `clientes.saf_disponible`, que reemplazara el escaneo full-history
--   `MAX(0, SUM(SAFC)-SUM(SAF))` sobre `movimientos_cuenta` ejecutado hoy en
--   6 sitios (3 write-path gates + 3 hooks de UI reactivos) por una lectura
--   O(1) mantenida por trigger (ver 0102_extender_trigger_saf_disponible.sql).
--
--   Esta migracion SOLO agrega la columna con DEFAULT 0 — ningun dato
--   historico se calcula aqui (eso es 0103, backfill de solo lectura).
--   Columna nueva + DEFAULT 0 es segura sobre tablas con filas existentes
--   (no requiere ACCESS EXCLUSIVE con reescritura de tabla en Postgres >= 11).
--
--   Indice parcial: la mayoria de los clientes NO tienen saldo a favor
--   (saf_disponible = 0 es el caso comun). Un indice parcial
--   `WHERE saf_disponible > 0` evita indexar el caso comun, igual que el
--   patron ya usado para columnas booleanas/estado en este proyecto
--   (ver supabase-postgres-best-practices: query-partial-indexes).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_clientes_saf_disponible;
--   ALTER TABLE clientes DROP COLUMN IF EXISTS saf_disponible;
-- =============================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS saf_disponible NUMERIC(20, 8) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clientes_saf_disponible
  ON clientes (empresa_id)
  WHERE saf_disponible > 0;
