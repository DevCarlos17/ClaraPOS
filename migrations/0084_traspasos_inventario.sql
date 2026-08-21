-- ============================================================
-- 0084_traspasos_inventario.sql
-- Slice 3a: Inventario Multideposito - Traspasos (schema)
--
-- Cabecera/detalle para mover stock entre depositos de una misma
-- empresa, atomicamente (kardex pareado salida+entrada), mirando
-- el patron header/detail ya usado por ventas/ventas_det y
-- facturas_compra/facturas_compra_det.
--
-- Inmutabilidad: SIN trigger dedicado ni policy de UPDATE/DELETE.
-- `autorizado_por`/`verificado_por` son placeholders nullable sin
-- flujo de aprobacion en este cambio (no hay estado PENDIENTE que
-- requiera un UPDATE posterior), por lo que RLS default-deny
-- (solo SELECT+INSERT) alcanza para la garantia de inmutabilidad
-- — igual criterio efectivo que movimientos_inventario/ventas_det.
--
-- No wire de escritura (hook `crearTraspaso`) ni UI en este slice.
-- Eso es 3b/3c. Ver design.md - "Traspasos Feature Design".
-- ============================================================

-- 1. Cabecera
CREATE TABLE IF NOT EXISTS traspasos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  deposito_origen_id UUID NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  deposito_destino_id UUID NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacion TEXT,
  -- Placeholders de autorizacion/verificacion: nullable, sin flujo en este
  -- cambio. Ver nota de inmutabilidad arriba.
  autorizado_por UUID REFERENCES usuarios(id),
  verificado_por UUID REFERENCES usuarios(id),
  correlativo_usuario INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT chk_traspaso_depositos_distintos CHECK (deposito_origen_id <> deposito_destino_id)
);

CREATE INDEX IF NOT EXISTS idx_traspasos_inv_empresa ON traspasos_inventario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_inv_usuario ON traspasos_inventario(empresa_id, usuario_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_inv_origen ON traspasos_inventario(deposito_origen_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_inv_destino ON traspasos_inventario(deposito_destino_id);

-- 2. Detalle
CREATE TABLE IF NOT EXISTS traspasos_inventario_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  traspaso_id UUID NOT NULL REFERENCES traspasos_inventario(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  -- Filas de kardex pareadas que este detalle liquida (salida del origen,
  -- entrada al destino) — ver buildTraspasoKardexPair en traspasos.ts.
  mov_salida_id UUID REFERENCES movimientos_inventario(id),
  mov_entrada_id UUID REFERENCES movimientos_inventario(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traspasos_inv_det_empresa ON traspasos_inventario_det(empresa_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_inv_det_traspaso ON traspasos_inventario_det(traspaso_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_inv_det_producto ON traspasos_inventario_det(producto_id);

-- 3. Ampliar CHECK de origen en movimientos_inventario para incluir TRA
--    (kardex generado por traspasos entre depositos). Idempotente: DROP+ADD.
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_origen_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_origen_check
  CHECK (origen IN ('MAN','FAC','VEN','AJU','NCR','COM','NDB','DEV','TRA'));

-- 4. RLS: SELECT + INSERT only (sin UPDATE/DELETE) — inmutable por
--    RLS-default-deny, ver nota arriba.
ALTER TABLE traspasos_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON traspasos_inventario;
CREATE POLICY "select_own_empresa" ON traspasos_inventario FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON traspasos_inventario;
CREATE POLICY "insert_own_empresa" ON traspasos_inventario FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

ALTER TABLE traspasos_inventario_det ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON traspasos_inventario_det;
CREATE POLICY "select_own_empresa" ON traspasos_inventario_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON traspasos_inventario_det;
CREATE POLICY "insert_own_empresa" ON traspasos_inventario_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- 5. Agregar a la publicacion de PowerSync (patron 0079/0080 — idempotente,
--    ALTER PUBLICATION no soporta IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'traspasos_inventario'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE traspasos_inventario;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'traspasos_inventario_det'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE traspasos_inventario_det;
  END IF;
END $$;
