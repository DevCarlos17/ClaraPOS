-- =============================================================================
-- SEED: 20 Productos de Prueba con Stock Inicial
-- 5 departamentos x 4 productos cada uno
--
-- Instrucciones:
--   1. Ejecutar en el SQL Editor de Supabase
--   2. El script detecta automáticamente la primera empresa activa,
--      su primer depósito y su primer usuario
--   3. Si hay más de una empresa, descomenta la línea
--      v_empresa_id := 'TU-UUID-AQUI'; en la sección de configuración
--   4. Los productos ya existentes (mismo codigo) se omiten
--      Los kardex solo se crean para productos nuevos (no duplica stock)
-- =============================================================================

DO $$
DECLARE
  v_empresa_id  UUID;
  v_deposito_id UUID;
  v_usuario_id  UUID;

  -- IDs de departamentos
  v_dept_fac    UUID;
  v_dept_cor    UUID;
  v_dept_cap    UUID;
  v_dept_mas    UUID;
  v_dept_una    UUID;

  -- ID del producto recién creado (NULL si ya existía)
  v_prod_id     UUID;

BEGIN

  -- =========================================================
  -- CONFIGURACION (opcional)
  -- =========================================================
  -- Descomenta y ajusta si tienes más de una empresa:
  -- v_empresa_id := 'TU-EMPRESA-UUID-AQUI';

  -- =========================================================
  -- 1. DETECTAR EMPRESA, DEPOSITO Y USUARIO
  -- =========================================================
  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id
    FROM empresas
    WHERE is_active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ninguna empresa activa. Crea una empresa primero.';
  END IF;

  SELECT id INTO v_deposito_id
  FROM depositos
  WHERE empresa_id = v_empresa_id AND is_active = true
  ORDER BY es_principal DESC, created_at
  LIMIT 1;

  IF v_deposito_id IS NULL THEN
    RAISE EXCEPTION 'No hay depósitos para la empresa %. Crea un depósito primero.', v_empresa_id;
  END IF;

  SELECT id INTO v_usuario_id
  FROM usuarios
  WHERE empresa_id = v_empresa_id AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No hay usuarios para la empresa %.', v_empresa_id;
  END IF;

  RAISE NOTICE '=== Empresa: % | Depósito: % | Usuario: % ===',
    v_empresa_id, v_deposito_id, v_usuario_id;

  -- =========================================================
  -- 2. DEPARTAMENTOS (se omiten si ya existen)
  -- =========================================================
  INSERT INTO departamentos (id, empresa_id, codigo, nombre, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'FAC', 'Tratamientos Faciales', true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
  SELECT id INTO v_dept_fac FROM departamentos WHERE empresa_id = v_empresa_id AND codigo = 'FAC';

  INSERT INTO departamentos (id, empresa_id, codigo, nombre, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'COR', 'Tratamientos Corporales', true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
  SELECT id INTO v_dept_cor FROM departamentos WHERE empresa_id = v_empresa_id AND codigo = 'COR';

  INSERT INTO departamentos (id, empresa_id, codigo, nombre, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'CAP', 'Cuidado Capilar', true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
  SELECT id INTO v_dept_cap FROM departamentos WHERE empresa_id = v_empresa_id AND codigo = 'CAP';

  INSERT INTO departamentos (id, empresa_id, codigo, nombre, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'MAS', 'Masajes y Relajacion', true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
  SELECT id INTO v_dept_mas FROM departamentos WHERE empresa_id = v_empresa_id AND codigo = 'MAS';

  INSERT INTO departamentos (id, empresa_id, codigo, nombre, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'UNA', 'Cuidado de Unas', true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
  SELECT id INTO v_dept_una FROM departamentos WHERE empresa_id = v_empresa_id AND codigo = 'UNA';

  RAISE NOTICE 'Departamentos: FAC=% | COR=% | CAP=% | MAS=% | UNA=%',
    v_dept_fac, v_dept_cor, v_dept_cap, v_dept_mas, v_dept_una;

  -- =========================================================
  -- 3. PRODUCTOS + KARDEX INICIAL
  --
  -- Patrón por cada producto:
  --   a) INSERT producto con stock=0 (ON CONFLICT DO NOTHING)
  --      RETURNING id → NULL si ya existía
  --   b) Si el producto fue creado ahora, insertar kardex tipo='E'
  --      El trigger actualizar_inventario_stock() actualiza stock automáticamente
  -- =========================================================

  -- -------------------------------------------------------
  -- DEPARTAMENTO: Tratamientos Faciales (FAC)
  -- -------------------------------------------------------

  -- FAC-001: Crema Hidratante Facial
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-FAC-001', 'P', 'Crema Hidratante Facial', v_dept_fac,
    8.00, 20.00, 17.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      50, 0, 50, 8.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- FAC-002: Serum Vitamina C
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-FAC-002', 'P', 'Serum Vitamina C Brightening', v_dept_fac,
    15.00, 38.00, 32.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      30, 0, 30, 15.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- FAC-003: Mascarilla de Arcilla
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-FAC-003', 'P', 'Mascarilla Arcilla Verde Purificante', v_dept_fac,
    6.00, 16.00, 13.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      40, 0, 40, 6.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- FAC-004: Tonico Facial
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-FAC-004', 'P', 'Tonico Facial Agua de Rosas', v_dept_fac,
    10.00, 25.00, 21.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      25, 0, 25, 10.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- -------------------------------------------------------
  -- DEPARTAMENTO: Tratamientos Corporales (COR)
  -- -------------------------------------------------------

  -- COR-001: Aceite Corporal de Coco
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-COR-001', 'P', 'Aceite Corporal de Coco Organico', v_dept_cor,
    7.00, 18.00, 15.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      35, 0, 35, 7.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- COR-002: Exfoliante Corporal
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-COR-002', 'P', 'Exfoliante Corporal Azucar y Canela', v_dept_cor,
    9.00, 22.00, 19.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      20, 0, 20, 9.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- COR-003: Crema Reafirmante
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-COR-003', 'P', 'Crema Reafirmante Anti-Celulitis', v_dept_cor,
    18.00, 45.00, 38.00, 'Gravable', 0, 3, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      15, 0, 15, 18.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- COR-004: Locion Bronceadora
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-COR-004', 'P', 'Locion Bronceadora Natural SPF 15', v_dept_cor,
    12.00, 28.00, 24.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      22, 0, 22, 12.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- -------------------------------------------------------
  -- DEPARTAMENTO: Cuidado Capilar (CAP)
  -- -------------------------------------------------------

  -- CAP-001: Champu Keratina
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-CAP-001', 'P', 'Champu Keratina Sin Sulfatos 500ml', v_dept_cap,
    10.00, 25.00, 21.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      40, 0, 40, 10.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- CAP-002: Acondicionador Nutritivo
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-CAP-002', 'P', 'Acondicionador Nutritivo Cabello Seco 500ml', v_dept_cap,
    10.00, 25.00, 21.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      38, 0, 38, 10.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- CAP-003: Mascarilla Capilar
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-CAP-003', 'P', 'Mascarilla Capilar Reparacion Intensiva', v_dept_cap,
    12.00, 30.00, 25.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      20, 0, 20, 12.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- CAP-004: Tratamiento Anti-Frizz
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-CAP-004', 'P', 'Tratamiento Anti-Frizz Aceite de Argan', v_dept_cap,
    20.00, 50.00, 42.00, 'Gravable', 0, 3, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      12, 0, 12, 20.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- -------------------------------------------------------
  -- DEPARTAMENTO: Masajes y Relajacion (MAS)
  -- -------------------------------------------------------

  -- MAS-001: Aceite de Masaje
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-MAS-001', 'P', 'Aceite de Masaje Relajante Lavanda', v_dept_mas,
    8.00, 20.00, 17.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      30, 0, 30, 8.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- MAS-002: Piedras Basalticas
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-MAS-002', 'P', 'Piedras Basalticas Volcanicas Set 12 pzas', v_dept_mas,
    25.00, 60.00, 52.00, 'Gravable', 0, 2, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      8, 0, 8, 25.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- MAS-003: Crema de Masaje
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-MAS-003', 'P', 'Crema de Masaje con Arnica Montana', v_dept_mas,
    11.00, 28.00, 24.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      18, 0, 18, 11.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- MAS-004: Gel Reductor
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-MAS-004', 'P', 'Gel Reductor Termogenico Cafeina', v_dept_mas,
    14.00, 35.00, 30.00, 'Gravable', 0, 5, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      24, 0, 24, 14.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- -------------------------------------------------------
  -- DEPARTAMENTO: Cuidado de Unas (UNA)
  -- -------------------------------------------------------

  -- UNA-001: Esmalte Semipermanente Rosa
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-UNA-001', 'P', 'Esmalte Semipermanente Rosa Chicle UV', v_dept_una,
    5.00, 12.00, 10.00, 'Gravable', 0, 10, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      60, 0, 60, 5.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- UNA-002: Esmalte Semipermanente Rojo
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-UNA-002', 'P', 'Esmalte Semipermanente Rojo Carmin UV', v_dept_una,
    5.00, 12.00, 10.00, 'Gravable', 0, 10, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      55, 0, 55, 5.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- UNA-003: Removedor de Esmalte
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-UNA-003', 'P', 'Removedor Esmalte Semipermanente Sin Acetona', v_dept_una,
    4.00, 10.00, 8.00, 'Gravable', 0, 10, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      45, 0, 45, 4.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- UNA-004: Top Coat UV
  INSERT INTO productos (id, empresa_id, codigo, tipo, nombre, departamento_id,
    costo_usd, precio_venta_usd, precio_mayor_usd, tipo_impuesto,
    stock, stock_minimo, is_active, created_at, updated_at, created_by)
  VALUES (gen_random_uuid(), v_empresa_id, 'P-UNA-004', 'P', 'Top Coat UV Acabado Brillante Duradero', v_dept_una,
    6.00, 15.00, 13.00, 'Gravable', 0, 10, true, NOW(), NOW(), v_usuario_id)
  ON CONFLICT (empresa_id, codigo) DO NOTHING
  RETURNING id INTO v_prod_id;
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO movimientos_inventario (id, empresa_id, producto_id, deposito_id, tipo, origen,
      cantidad, stock_anterior, stock_nuevo, costo_unitario, motivo, usuario_id, fecha, created_at)
    VALUES (gen_random_uuid(), v_empresa_id, v_prod_id, v_deposito_id, 'E', 'AJU',
      35, 0, 35, 6.00, 'Stock inicial de prueba', v_usuario_id, NOW(), NOW());
  END IF;

  -- =========================================================
  -- 4. RESUMEN
  -- =========================================================
  RAISE NOTICE '=== SEED COMPLETADO ===';
  RAISE NOTICE 'Se crearon hasta 20 productos en 5 departamentos.';
  RAISE NOTICE 'Los productos ya existentes (por codigo) fueron omitidos.';
  RAISE NOTICE '';
  RAISE NOTICE 'Departamentos creados/existentes:';
  RAISE NOTICE '  FAC - Tratamientos Faciales   (4 productos)';
  RAISE NOTICE '  COR - Tratamientos Corporales  (4 productos)';
  RAISE NOTICE '  CAP - Cuidado Capilar          (4 productos)';
  RAISE NOTICE '  MAS - Masajes y Relajacion     (4 productos)';
  RAISE NOTICE '  UNA - Cuidado de Unas          (4 productos)';

END $$;

-- Verificacion: muestra los productos creados con su stock actual
SELECT
  d.codigo AS dept,
  p.codigo,
  p.nombre,
  p.costo_usd::numeric(12,2)        AS costo,
  p.precio_venta_usd::numeric(12,2) AS pvp,
  p.stock::numeric(12,0)            AS stock
FROM productos p
JOIN departamentos d ON d.id = p.departamento_id
WHERE p.codigo LIKE 'P-FAC-%'
   OR p.codigo LIKE 'P-COR-%'
   OR p.codigo LIKE 'P-CAP-%'
   OR p.codigo LIKE 'P-MAS-%'
   OR p.codigo LIKE 'P-UNA-%'
ORDER BY d.codigo, p.codigo;
