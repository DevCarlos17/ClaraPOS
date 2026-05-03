-- Agrega columna origen_fondos_tipo a vencimientos_cobrar
-- Indica si los fondos del préstamo/avance provienen de la caja activa,
-- del efectivo general de la empresa, o de una cuenta bancaria.
ALTER TABLE vencimientos_cobrar
  ADD COLUMN IF NOT EXISTS origen_fondos_tipo TEXT DEFAULT 'CAJA';
