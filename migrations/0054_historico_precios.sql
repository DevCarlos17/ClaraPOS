-- ============================================================
-- 0054_historico_precios.sql
-- Tabla de auditoria de cambios de precio en facturas de compra.
-- Registra quien cambio que precio, cuando, y cuanto fue el delta.
--
-- Esta tabla es INMUTABLE: solo INSERT. Sin UPDATE ni DELETE.
-- Los registros se crean automaticamente al procesar una factura
-- de compra que actualiza el costo/pvp de un producto.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.historico_precios (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES public.empresas(id),
  factura_compra_id UUID        NOT NULL REFERENCES public.facturas_compra(id),
  producto_id       UUID        NOT NULL REFERENCES public.productos(id),
  usuario_id        UUID        NOT NULL REFERENCES public.usuarios(id),
  costo_anterior    NUMERIC(14, 4) NOT NULL,
  costo_nuevo       NUMERIC(14, 4) NOT NULL,
  pvp_anterior      NUMERIC(14, 4) NOT NULL,
  pvp_nuevo         NUMERIC(14, 4) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_historico_precios_empresa
  ON public.historico_precios (empresa_id);

CREATE INDEX IF NOT EXISTS idx_historico_precios_producto
  ON public.historico_precios (producto_id);

CREATE INDEX IF NOT EXISTS idx_historico_precios_factura
  ON public.historico_precios (factura_compra_id);

-- RLS: habilitado, solo lectura/insercion para usuarios autenticados
ALTER TABLE public.historico_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historico_precios_select" ON public.historico_precios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "historico_precios_insert" ON public.historico_precios
  FOR INSERT TO authenticated WITH CHECK (true);

-- Sin UPDATE ni DELETE (tabla de auditoria inmutable)
