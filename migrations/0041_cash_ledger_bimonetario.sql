-- =============================================
-- CLARAPOS: 0041 - CASH LEDGER BIMONETARIO
-- Implementa el modelo de caja descrito en task.md:
--   1. Origen VUELTO en movimientos_metodo_cobro
--   2. Saldos esperados por divisa en sesiones_caja (USD y VES independientes)
--   3. Campos de trazabilidad para AVANCE y PRESTAMO
--   4. Trigger: bloquear inserciones en sesiones cerradas
-- Depende de: 0005 (caja_tesoreria), 0030 (movimientos manuales), 0031 (bimonetario)
-- =============================================

-- ============================================================
-- 1. EXPANDIR CHECK DE ORIGEN: agregar VUELTO
--    El vuelto entregado al cliente se registra como EGRESO
--    inmutable en movimientos_metodo_cobro, igual que los demas
--    movimientos manuales de caja.
-- ============================================================

ALTER TABLE movimientos_metodo_cobro
  DROP CONSTRAINT IF EXISTS movimientos_metodo_cobro_origen_check;

ALTER TABLE movimientos_metodo_cobro
  ADD CONSTRAINT movimientos_metodo_cobro_origen_check
  CHECK (origen IN (
    'VENTA',
    'PAGO_CXC',
    'DEPOSITO_BANCO',
    'RETIRO',
    'AJUSTE',
    'APERTURA_CAJA',
    'CIERRE_CAJA',
    'INGRESO_MANUAL',
    'EGRESO_MANUAL',
    'AVANCE',
    'PRESTAMO',
    'VUELTO'        -- NUEVO: dinero que sale de gaveta como cambio al cliente
  ));

-- ============================================================
-- 2. SALDOS POR DIVISA EN sesiones_caja
--    Agrega los campos para rastrear el saldo esperado y fisico
--    en VES de forma independiente al USD.
--    DEFAULT NULL para retrocompatibilidad con sesiones antiguas.
-- ============================================================

ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS monto_sistema_bs  NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_fisico_bs   NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS diferencia_bs     NUMERIC(15,2) DEFAULT NULL;

-- ============================================================
-- 3. TRAZABILIDAD EN movimientos_metodo_cobro
--    Campos requeridos para auditar AVANCE y PRESTAMO segun spec:
--      - autorizado_por_id: supervisor que autoriza el movimiento
--      - destinatario_id: empleado que recibe el prestamo
--      - referencia_pago_digital_id: pago digital que origina un avance
-- ============================================================

ALTER TABLE movimientos_metodo_cobro
  ADD COLUMN IF NOT EXISTS autorizado_por_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destinatario_id             UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referencia_pago_digital_id  UUID REFERENCES pagos(id)   ON DELETE SET NULL;

-- Indice para lookup de avances por pago digital referenciado
CREATE INDEX IF NOT EXISTS idx_mov_cobro_ref_pago_digital
  ON movimientos_metodo_cobro(referencia_pago_digital_id)
  WHERE referencia_pago_digital_id IS NOT NULL;

-- ============================================================
-- 4. TRIGGER: BLOQUEAR INSERCIONES EN SESIONES CERRADAS
--    Garantiza que ninguna operacion financiera (pago o movimiento)
--    pueda registrarse contra una sesion que ya esta CERRADA o CUADRADA.
--    Esto hace la sesion inmutable una vez cerrada.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_validate_sesion_abierta()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Solo validar cuando hay sesion_caja_id asociada
  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT status INTO v_status
    FROM sesiones_caja
    WHERE id = NEW.sesion_caja_id;

    IF v_status IS DISTINCT FROM 'ABIERTA' THEN
      RAISE EXCEPTION
        'Operacion rechazada: la sesion de caja % tiene status %. Solo se permiten operaciones sobre sesiones ABIERTA.',
        NEW.sesion_caja_id,
        COALESCE(v_status, 'NO_ENCONTRADA');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a movimientos_metodo_cobro (ingresos, egresos, vueltos, avances, prestamos)
DROP TRIGGER IF EXISTS trg_validate_sesion_movimientos ON movimientos_metodo_cobro;
CREATE TRIGGER trg_validate_sesion_movimientos
  BEFORE INSERT ON movimientos_metodo_cobro
  FOR EACH ROW EXECUTE FUNCTION fn_validate_sesion_abierta();

-- Aplicar a pagos (evita cobros post-cierre de sesion)
DROP TRIGGER IF EXISTS trg_validate_sesion_pagos ON pagos;
CREATE TRIGGER trg_validate_sesion_pagos
  BEFORE INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_validate_sesion_abierta();
