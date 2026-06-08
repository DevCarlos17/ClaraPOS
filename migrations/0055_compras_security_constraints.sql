-- =============================================
-- CLARAPOS: 0055 - Security constraints: facturas_compra
--
-- Problema: nro_factura y nro_control son TEXT sin restriccion de formato,
-- lo que permite guardar HTML/scripts (XSS persistente) y strings arbitrarios.
-- fecha_factura acepta cualquier DATE (año 1 o año 9999).
-- costo_unitario_usd usa >= 0 cuando deberia ser > 0.
--
-- Solucion: CHECK constraints en la DB como segunda linea de defensa
-- (la primera es Zod en el frontend).
--
-- Se usa NOT VALID en los constraints de formato para no bloquear datos
-- historicos que pudieran tener minusculas o formatos distintos.
-- Los nuevos inserts SI seran validados.
-- =============================================

-- ── 1. nro_factura ────────────────────────────────────────────────────────────
-- Limite de longitud: valida contra datos existentes (improbable que haya > 50 chars)
ALTER TABLE facturas_compra
  ADD CONSTRAINT chk_nro_factura_length
    CHECK (char_length(nro_factura) <= 50);

-- Solo caracteres seguros: letras mayusculas, numeros, guion, punto, espacio.
-- NOT VALID: no revalida filas historicas; aplica solo a inserts/updates nuevos.
ALTER TABLE facturas_compra
  ADD CONSTRAINT chk_nro_factura_chars
    CHECK (nro_factura ~ '^[A-Z0-9\-\.\/ ]+$') NOT VALID;

-- ── 2. nro_control (opcional) ─────────────────────────────────────────────────
ALTER TABLE facturas_compra
  ADD CONSTRAINT chk_nro_control_length
    CHECK (nro_control IS NULL OR char_length(nro_control) <= 20);

-- Formato venezolano tipico: "XX-XXXXXXX". Permite NULL.
ALTER TABLE facturas_compra
  ADD CONSTRAINT chk_nro_control_chars
    CHECK (nro_control IS NULL OR nro_control ~ '^[A-Z0-9\-]+$') NOT VALID;

-- ── 3. fecha_factura ──────────────────────────────────────────────────────────
-- Rango estatico: evita errores de digitacion catastroficos (año 1900, año 2999).
-- El limite dinamico "no mas de 1 dia en el futuro" se mantiene en Zod (frontend)
-- porque un CHECK con CURRENT_DATE puede romper validaciones de filas historicas.
ALTER TABLE facturas_compra
  ADD CONSTRAINT chk_fecha_factura_rango
    CHECK (fecha_factura >= '2020-01-01' AND fecha_factura <= '2099-12-31');

-- ── 4. costo_unitario_usd: corregir >= 0 a > 0 ───────────────────────────────
-- El constraint existente permite costo = 0, lo que es invalido en una compra.
-- Se elimina el constraint implicito de la columna y se agrega uno nombrado.
ALTER TABLE facturas_compra_det
  DROP CONSTRAINT IF EXISTS facturas_compra_det_costo_unitario_usd_check;

ALTER TABLE facturas_compra_det
  ADD CONSTRAINT chk_det_costo_positivo
    CHECK (costo_unitario_usd > 0);

-- ── Verificacion manual (ejecutar antes en entornos con datos existentes) ──────
-- Antes de aplicar, podés chequear que no hay filas que violarían los constraints:
--
--   SELECT id, nro_factura FROM facturas_compra
--     WHERE char_length(nro_factura) > 50
--        OR NOT (nro_factura ~ '^[A-Z0-9\-\.\/ ]+$');
--
--   SELECT id, nro_control FROM facturas_compra
--     WHERE nro_control IS NOT NULL AND char_length(nro_control) > 20;
--
--   SELECT id, fecha_factura FROM facturas_compra
--     WHERE fecha_factura < '2020-01-01' OR fecha_factura > '2099-12-31';
--
--   SELECT id, costo_unitario_usd FROM facturas_compra_det
--     WHERE costo_unitario_usd <= 0;
