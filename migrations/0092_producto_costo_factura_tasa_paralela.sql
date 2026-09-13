-- =============================================
-- CLARAPOS: 0092 - COSTO SEGUN FACTURA + INDICADOR DE TASA PARALELA EN PRODUCTOS
-- Agrega a la ficha de producto dos campos para soportar compras a tasa paralela:
--   costo_factura_usd  = costo POR UNIDAD segun la ultima factura de compra
--                        (a la tasa del proveedor). Es el valor que el formulario
--                        de compra debe precargar, NO el costo contable, para
--                        evitar recursividad al reconvertir por la tasa paralela.
--   tasa_paralela_ref  = tasa paralela usada en la ultima compra. NULL indica que
--                        el producto se maneja a la tasa interna/oficial (costo y
--                        costo contable coinciden). Se guarda el NUMERO para
--                        habilitar recalculo selectivo futuro por tipo de tasa.
--
-- Relacion con costo_usd (ya existente):
--   costo_usd          = costo CONTABLE (ajustado a tasa interna/BCV). Es el que
--                        alimenta valuacion de inventario, kardex y recalculo de
--                        precios. Sin tasa paralela: costo_usd == costo_factura_usd.
--                        Con tasa paralela: difieren (comportamiento esperado).
--
-- Regla "ultimo movimiento manda": una compra SIN tasa paralela sobre un producto
-- que antes la tenia limpia tasa_paralela_ref (NULL) y deja
-- costo_factura_usd == costo_usd. Esta logica vive en el frontend (use-compras.ts).
-- =============================================

-- 1. Costo segun factura (tasa proveedor). NUMERIC(20,8) igual que costo_usd (migracion 0058).
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS costo_factura_usd NUMERIC(20,8);

-- 2. Tasa paralela de referencia. NUMERIC(14,4): las tasas se manejan a 4 decimales
--    (regla de negocio #10). El valor se persiste con .toFixed(4) en el frontend.
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS tasa_paralela_ref NUMERIC(14,4);

-- 3. Poblar filas existentes: el costo segun factura arranca igual al costo contable
--    (productos sin historial de tasa paralela). tasa_paralela_ref queda NULL
--    (tasa interna). Idempotente: solo toca filas aun sin valor.
UPDATE productos
SET costo_factura_usd = CAST(costo_usd AS NUMERIC)
WHERE costo_factura_usd IS NULL;

-- 4. RLS: productos ya permite UPDATE para usuarios autenticados; los campos nuevos
--    heredan las politicas existentes de la tabla. No se requieren cambios de RLS.
