-- Permite préstamos/avances standalone (sin factura asociada)
-- venta_id puede ser NULL cuando el préstamo no está vinculado a una venta.
-- La restricción UNIQUE(empresa_id, venta_id, nro_cuota) sigue siendo válida:
-- en PostgreSQL cada NULL se considera distinto de otros NULL en contexto UNIQUE,
-- por lo que múltiples préstamos standalone con nro_cuota=1 no colisionan.

ALTER TABLE vencimientos_cobrar
  ALTER COLUMN venta_id DROP NOT NULL;
