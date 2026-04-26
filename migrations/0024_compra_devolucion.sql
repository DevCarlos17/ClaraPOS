-- =============================================
-- CLARAPOS: 0024 - DEVOLUCIÓN DE FACTURA DE COMPRA
-- Agrega soporte para reverso total de facturas de compra:
--   - Status REVERSADA en facturas_compra
--   - Tipo DEV en movimientos_cuenta_proveedor
--   - Origen DEV en movimientos_inventario
-- =============================================

-- 1. facturas_compra: ampliar CHECK de status para incluir REVERSADA
ALTER TABLE facturas_compra
  DROP CONSTRAINT IF EXISTS facturas_compra_status_check;
ALTER TABLE facturas_compra
  ADD CONSTRAINT facturas_compra_status_check
  CHECK (status IN ('BORRADOR','PROCESADA','ANULADA','REVERSADA'));

-- 2. Actualizar trigger de inmutabilidad para permitir PROCESADA -> REVERSADA
CREATE OR REPLACE FUNCTION prevent_factura_compra_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las facturas de compra no se pueden eliminar';
  END IF;

  IF OLD.status = 'PROCESADA' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('ANULADA', 'REVERSADA') THEN
        RAISE EXCEPTION 'Una factura procesada solo puede cambiar a ANULADA o REVERSADA';
      END IF;
    END IF;
    IF NEW.total_usd IS DISTINCT FROM OLD.total_usd
       OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
       OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
       OR NEW.nro_factura IS DISTINCT FROM OLD.nro_factura THEN
      RAISE EXCEPTION 'No se pueden modificar los datos de una factura procesada';
    END IF;
  END IF;

  IF OLD.status IN ('ANULADA', 'REVERSADA') THEN
    RAISE EXCEPTION 'No se puede modificar una factura anulada o reversada';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. movimientos_cuenta_proveedor: ampliar CHECK de tipo para incluir DEV
ALTER TABLE movimientos_cuenta_proveedor
  DROP CONSTRAINT IF EXISTS movimientos_cuenta_proveedor_tipo_check;
ALTER TABLE movimientos_cuenta_proveedor
  ADD CONSTRAINT movimientos_cuenta_proveedor_tipo_check
  CHECK (tipo IN ('FAC','PAG','NC','ND','DEV'));

-- 4. movimientos_cuenta_proveedor: ampliar CHECK de doc_origen_tipo para incluir DEV_COMPRA
ALTER TABLE movimientos_cuenta_proveedor
  DROP CONSTRAINT IF EXISTS movimientos_cuenta_proveedor_doc_origen_tipo_check;
ALTER TABLE movimientos_cuenta_proveedor
  ADD CONSTRAINT movimientos_cuenta_proveedor_doc_origen_tipo_check
  CHECK (doc_origen_tipo IN ('FACTURA_COMPRA','PAGO','NC_COMPRA','ND_COMPRA','DEV_COMPRA'));

-- 5. Actualizar trigger de saldo proveedor para manejar DEV (reduce deuda, igual que PAG/NC)
CREATE OR REPLACE FUNCTION actualizar_saldo_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM proveedores WHERE id = NEW.proveedor_id;

  IF NEW.tipo IN ('FAC', 'ND') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NC', 'DEV') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta_prov', TRUE);
  UPDATE proveedores SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.proveedor_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. movimientos_inventario: ampliar CHECK de origen para incluir DEV (devolución de compra)
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_origen_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_origen_check
  CHECK (origen IN ('MAN','FAC','VEN','AJU','NCR','COM','NDB','DEV'));

-- 7. Permiso para reversar facturas de compra
INSERT INTO permisos (modulo, slug, nombre, descripcion)
SELECT 'compras', 'compras.reversar_factura', 'Reversar facturas de compra',
       'Permite reversar una factura de compra (reverso total con ajuste de inventario y CxP)'
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE slug = 'compras.reversar_factura');
