-- Migration: 0050_add_saf_origen_refs
-- Adds traceability column to movimientos_cuenta for SAF (saldo a favor) movements.
-- Nullable, no backfill. Existing rows will have saf_origen_refs = NULL.
-- Rollback: ALTER TABLE movimientos_cuenta DROP COLUMN saf_origen_refs;

ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT;
