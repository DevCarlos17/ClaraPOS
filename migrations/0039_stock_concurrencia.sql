-- ============================================================
-- 0039_stock_concurrencia.sql
-- Proteccion contra race conditions multi-caja en stock
--
-- Modifica actualizar_inventario_stock() para que, tras aplicar
-- una salida de inventario, lea el valor REAL resultante en
-- inventario_stock y rechace la transaccion si quedo negativo.
--
-- La fila de inventario_stock queda bloqueada (row lock) por el
-- ON CONFLICT DO UPDATE, lo que serializa automaticamente las
-- escrituras concurrentes del mismo producto. La segunda caja
-- esperara a que la primera confirme, y si el stock resultante
-- es negativo, la excepcion revierte toda la transaccion.
--
-- PowerSync esta configurado para tratar RAISE EXCEPTION (P0001)
-- como error fatal, por lo que el movimiento rechazado no se
-- reintenta en el dispositivo.
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_inventario_stock()
RETURNS TRIGGER AS $$
DECLARE
  nueva_cantidad NUMERIC;
BEGIN
  -- Upsert en inventario_stock (toma row lock en el conflicto)
  INSERT INTO inventario_stock (empresa_id, producto_id, deposito_id, cantidad_actual)
  VALUES (
    NEW.empresa_id,
    NEW.producto_id,
    NEW.deposito_id,
    CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END
  )
  ON CONFLICT (empresa_id, producto_id, deposito_id)
  DO UPDATE SET
    cantidad_actual = inventario_stock.cantidad_actual +
      CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END,
    updated_at = NOW();

  -- Leer el stock real resultante (post-upsert)
  SELECT cantidad_actual INTO nueva_cantidad
  FROM inventario_stock
  WHERE empresa_id  = NEW.empresa_id
    AND producto_id = NEW.producto_id
    AND deposito_id = NEW.deposito_id;

  -- Rechazar si una salida dejo el stock en negativo real.
  -- Esto captura el caso en que dos cajas leyeron el mismo stock
  -- local y ambas intentaron descontarlo: la segunda fallara aqui.
  IF NEW.tipo = 'S' AND nueva_cantidad < -0.001 THEN
    RAISE EXCEPTION 'STOCK_NEGATIVO: producto=%, stock_real=%, solicitado=%',
      NEW.producto_id,
      (nueva_cantidad + NEW.cantidad),  -- stock antes de este insert
      NEW.cantidad
    USING ERRCODE = 'P0001';
  END IF;

  -- Actualizar productos.stock como suma de todos los depositos
  UPDATE productos
  SET stock = (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM inventario_stock
    WHERE producto_id = NEW.producto_id
      AND empresa_id  = NEW.empresa_id
  )
  WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
