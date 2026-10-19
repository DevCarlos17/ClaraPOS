-- =============================================================================
-- Migration: 0109_clientes_saldo_pendiente_column.sql
-- Created:   2026-10-18
-- Depends:   0102_extender_trigger_saf_disponible.sql (mismo trigger a extender
--            en 0110), 0108_ventas_estado_tolerancia_cero.sql (tolerancia 0
--            exacta que esta columna debe respetar)
--
-- PURPOSE:
--   Slice 1a de cxc-ledger-saldos-redesign. Agrega la columna snapshot
--   `clientes.saldo_pendiente_usd`, que reemplazara el escaneo full-history
--   `SUM(ventas.saldo_pend_usd) WHERE estado != 'pago'` ejecutado hoy en
--   3 lecturas (`use-cxc.ts` `DEUDA_CREDITO_CLIENTE_SELECT`, y
--   `use-deuda-cliente.ts` `useDeudaFacturasCliente`/`useDeudaFacturasClientes`)
--   por una lectura O(1) mantenida por trigger (ver
--   0110_extender_trigger_saldo_pendiente.sql) — mismo patron exacto que
--   `clientes.saf_disponible` (0101/0102).
--
--   Esta migracion SOLO agrega la columna con DEFAULT 0 — ningun dato
--   historico se calcula aqui (eso es 0111, backfill de solo lectura).
--   Columna nueva + DEFAULT 0 es segura sobre tablas con filas existentes
--   (no requiere ACCESS EXCLUSIVE con reescritura de tabla en Postgres >= 11).
--
--   A diferencia de `saf_disponible` (0101), esta columna NO lleva un indice
--   parcial propio: no es el caso comun de "la mayoria en 0" — la deuda
--   pendiente es precisamente el dato que la pantalla de CxC necesita leer
--   para TODOS los clientes con factura abierta, no solo un subconjunto
--   raro. El filtro multi-tenant ya cuenta con el indice existente sobre
--   `clientes(empresa_id, ...)` del schema base (0001).
--
-- ROLLBACK:
--   ALTER TABLE clientes DROP COLUMN IF EXISTS saldo_pendiente_usd;
-- =============================================================================

BEGIN;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS saldo_pendiente_usd NUMERIC(20, 8) NOT NULL DEFAULT 0;

COMMIT;
