import { column, Schema, Table } from '@powersync/web'

// =============================================
// CATALOGOS GLOBALES (sin empresa_id)
// =============================================

const monedas = new Table(
  {
    codigo_iso: column.text,
    nombre: column.text,
    simbolo: column.text,
    decimales: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const tipos_persona_ve = new Table(
  {
    codigo: column.text,
    nombre: column.text,
    es_entidad_legal: column.integer,
    aplica_sustraendo: column.integer,
    formato_regexp: column.text,
    is_active: column.integer,
  },
  { indexes: {} }
)

const islr_conceptos_ve = new Table(
  {
    codigo_seniat: column.text,
    descripcion: column.text,
    porcentaje_pj: column.text,
    porcentaje_pn: column.text,
    sustraendo_ut: column.text,
    monto_minimo_base: column.text,
    is_active: column.integer,
  },
  { indexes: {} }
)

const tipos_movimiento = new Table(
  {
    nombre: column.text,
    slug: column.text,
    operacion: column.text,
    requiere_doc: column.integer,
    is_active: column.integer,
    created_at: column.text,
  },
  { indexes: {} }
)

const permisos = new Table(
  {
    modulo: column.text,
    slug: column.text,
    nombre: column.text,
    descripcion: column.text,
    is_active: column.integer,
    created_at: column.text,
  },
  { indexes: {} }
)

// =============================================
// CORE: Empresa, usuarios, roles, permisos
// =============================================

const empresas = new Table(
  {
    tenant_id: column.text,
    nombre: column.text,
    rif: column.text,
    direccion: column.text,
    telefono: column.text,
    email: column.text,
    logo_url: column.text,
    timezone: column.text,
    moneda_base: column.text,
    config: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const empresas_fiscal_ve = new Table(
  {
    empresa_id: column.text,
    tipo_contribuyente: column.text,
    es_agente_retencion: column.integer,
    documento_identidad: column.text,
    tipo_documento: column.text,
    nro_providencia: column.text,
    porcentaje_retencion_iva: column.text,
    codigo_sucursal_seniat: column.text,
    usa_maquina_fiscal: column.integer,
    aplica_igtf: column.integer,
    created_at: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const usuarios = new Table(
  {
    empresa_id: column.text,
    email: column.text,
    nombre: column.text,
    telefono: column.text,
    rol_id: column.text,
    pin_supervisor_hash: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const roles = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    descripcion: column.text,
    is_system: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const rol_permisos = new Table(
  {
    empresa_id: column.text,
    rol_id: column.text,
    permiso_id: column.text,
    granted_by: column.text,
    granted_at: column.text,
  },
  { indexes: {} }
)

const tenant_permisos = new Table(
  {
    empresa_id: column.text,
    tenant_id: column.text,
    permiso_id: column.text,
    habilitado: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

// =============================================
// CONFIGURACION
// =============================================

const tasas_cambio = new Table(
  {
    empresa_id: column.text,
    moneda_id: column.text,
    valor: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const metodos_cobro = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    tipo: column.text,
    moneda_id: column.text,
    banco_empresa_id: column.text,
    requiere_referencia: column.integer,
    saldo_actual: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const bancos_empresa = new Table(
  {
    empresa_id: column.text,
    nombre_banco: column.text,
    nro_cuenta: column.text,
    tipo_cuenta: column.text,
    titular: column.text,
    titular_documento: column.text,
    moneda_id: column.text,
    saldo_actual: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const cajas = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    ubicacion: column.text,
    deposito_id: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// INVENTARIO
// =============================================

const departamentos = new Table(
  {
    empresa_id: column.text,
    codigo: column.text,
    nombre: column.text,
    parent_id: column.text,
    slug: column.text,
    descripcion: column.text,
    imagen_url: column.text,
    prioridad_visual: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const marcas = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    descripcion: column.text,
    logo_url: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const unidades = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    abreviatura: column.text,
    es_decimal: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const unidades_conversion = new Table(
  {
    empresa_id: column.text,
    unidad_mayor_id: column.text,
    unidad_menor_id: column.text,
    factor: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const depositos = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    direccion: column.text,
    es_principal: column.integer,
    permite_venta: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const productos = new Table(
  {
    empresa_id: column.text,
    codigo: column.text,
    tipo: column.text,
    nombre: column.text,
    departamento_id: column.text,
    marca_id: column.text,
    unidad_base_id: column.text,
    costo_usd: column.text,
    precio_venta_usd: column.text,
    precio_mayor_usd: column.text,
    costo_promedio: column.text,
    costo_ultimo: column.text,
    stock: column.text,
    stock_minimo: column.text,
    tipo_impuesto: column.text,
    impuesto_iva_id: column.text,
    impuesto_igtf_id: column.text,
    maneja_lotes: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const inventario_stock = new Table(
  {
    empresa_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    cantidad_actual: column.text,
    stock_reservado: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const movimientos_inventario = new Table(
  {
    empresa_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    tipo_movimiento_id: column.text,
    tipo: column.text,
    origen: column.text,
    cantidad: column.text,
    stock_anterior: column.text,
    stock_nuevo: column.text,
    costo_unitario: column.text,
    moneda_id: column.text,
    tasa_cambio: column.text,
    doc_origen_id: column.text,
    doc_origen_ref: column.text,
    lote_id: column.text,
    motivo: column.text,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const recetas = new Table(
  {
    empresa_id: column.text,
    servicio_id: column.text,
    producto_id: column.text,
    cantidad: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const ajuste_motivos = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    es_sistema: column.integer,
    operacion_base: column.text,
    afecta_costo: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const ajustes = new Table(
  {
    empresa_id: column.text,
    num_ajuste: column.text,
    motivo_id: column.text,
    fecha: column.text,
    observaciones: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const ajustes_det = new Table(
  {
    empresa_id: column.text,
    ajuste_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    cantidad: column.text,
    costo_unitario: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const lotes = new Table(
  {
    empresa_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    nro_lote: column.text,
    fecha_fabricacion: column.text,
    fecha_vencimiento: column.text,
    cantidad_inicial: column.text,
    cantidad_actual: column.text,
    costo_unitario: column.text,
    factura_compra_id: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// FISCAL: Impuestos por empresa
// =============================================

const impuestos_ve = new Table(
  {
    empresa_id: column.text,
    nombre: column.text,
    tipo_tributo: column.text,
    porcentaje: column.text,
    codigo_seniat: column.text,
    descripcion: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// CLIENTES / CXC
// =============================================

const clientes = new Table(
  {
    empresa_id: column.text,
    tipo_persona_id: column.text,
    identificacion: column.text,
    nombre: column.text,
    nombre_comercial: column.text,
    direccion: column.text,
    telefono: column.text,
    email: column.text,
    es_contribuyente_especial: column.integer,
    es_agente_retencion_iva: column.integer,
    es_agente_retencion_islr: column.integer,
    porcentaje_retencion_iva: column.text,
    limite_credito_usd: column.text,
    saldo_actual: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const movimientos_cuenta = new Table(
  {
    empresa_id: column.text,
    cliente_id: column.text,
    tipo: column.text,
    referencia: column.text,
    monto: column.text,
    saldo_anterior: column.text,
    saldo_nuevo: column.text,
    observacion: column.text,
    doc_origen_id: column.text,
    doc_origen_tipo: column.text,
    venta_id: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const vencimientos_cobrar = new Table(
  {
    empresa_id: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    nro_cuota: column.integer,
    fecha_vencimiento: column.text,
    monto_original_usd: column.text,
    monto_pagado_usd: column.text,
    saldo_pendiente_usd: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

// =============================================
// VENTAS
// =============================================

const ventas = new Table(
  {
    empresa_id: column.text,
    cliente_id: column.text,
    nro_factura: column.text,
    num_control: column.text,
    deposito_id: column.text,
    sesion_caja_id: column.text,
    moneda_id: column.text,
    tasa: column.text,
    total_exento_usd: column.text,
    total_base_usd: column.text,
    total_iva_usd: column.text,
    total_igtf_usd: column.text,
    total_usd: column.text,
    total_bs: column.text,
    saldo_pend_usd: column.text,
    tipo: column.text,
    status: column.text,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const ventas_det = new Table(
  {
    empresa_id: column.text,
    venta_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    cantidad: column.text,
    precio_unitario_usd: column.text,
    tipo_impuesto: column.text,
    impuesto_pct: column.text,
    subtotal_usd: column.text,
    subtotal_bs: column.text,
    lote_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const pagos = new Table(
  {
    empresa_id: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    metodo_cobro_id: column.text,
    moneda_id: column.text,
    tasa: column.text,
    monto: column.text,
    monto_usd: column.text,
    referencia: column.text,
    sesion_caja_id: column.text,
    banco_empresa_id: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const notas_credito = new Table(
  {
    empresa_id: column.text,
    nro_ncr: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    tipo: column.text,
    motivo: column.text,
    moneda_id: column.text,
    tasa_historica: column.text,
    total_exento_usd: column.text,
    total_base_usd: column.text,
    total_iva_usd: column.text,
    total_usd: column.text,
    total_bs: column.text,
    afecta_inventario: column.integer,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const notas_credito_det = new Table(
  {
    empresa_id: column.text,
    nota_credito_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    cantidad: column.text,
    precio_unitario_usd: column.text,
    tipo_impuesto: column.text,
    impuesto_pct: column.text,
    subtotal_usd: column.text,
    afecta_inventario: column.integer,
    descripcion: column.text,
    lote_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const notas_debito = new Table(
  {
    empresa_id: column.text,
    nro_ndb: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    motivo: column.text,
    moneda_id: column.text,
    tasa: column.text,
    total_exento_usd: column.text,
    total_base_usd: column.text,
    total_iva_usd: column.text,
    total_usd: column.text,
    total_bs: column.text,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const notas_debito_det = new Table(
  {
    empresa_id: column.text,
    nota_debito_id: column.text,
    descripcion: column.text,
    cantidad: column.text,
    precio_unitario_usd: column.text,
    tipo_impuesto: column.text,
    impuesto_pct: column.text,
    subtotal_usd: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

// =============================================
// CAJA / TESORERIA
// =============================================

const sesiones_caja = new Table(
  {
    empresa_id: column.text,
    caja_id: column.text,
    usuario_apertura_id: column.text,
    fecha_apertura: column.text,
    monto_apertura_usd: column.text,
    usuario_cierre_id: column.text,
    fecha_cierre: column.text,
    monto_sistema_usd: column.text,
    monto_fisico_usd: column.text,
    diferencia_usd: column.text,
    observaciones_cierre: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const sesiones_caja_detalle = new Table(
  {
    empresa_id: column.text,
    sesion_caja_id: column.text,
    metodo_cobro_id: column.text,
    moneda_id: column.text,
    total_sistema: column.text,
    total_fisico: column.text,
    diferencia: column.text,
    num_transacciones: column.integer,
    created_at: column.text,
  },
  { indexes: {} }
)

const movimientos_metodo_cobro = new Table(
  {
    empresa_id: column.text,
    metodo_cobro_id: column.text,
    tipo: column.text,
    origen: column.text,
    monto: column.text,
    saldo_anterior: column.text,
    saldo_nuevo: column.text,
    doc_origen_id: column.text,
    doc_origen_ref: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const movimientos_bancarios = new Table(
  {
    empresa_id: column.text,
    banco_empresa_id: column.text,
    tipo: column.text,
    origen: column.text,
    monto: column.text,
    saldo_anterior: column.text,
    saldo_nuevo: column.text,
    doc_origen_id: column.text,
    doc_origen_tipo: column.text,
    referencia: column.text,
    validado: column.integer,
    validado_por: column.text,
    validado_at: column.text,
    observacion: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// RETENCIONES VENTAS
// =============================================

const retenciones_iva_ventas = new Table(
  {
    empresa_id: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    nro_comprobante: column.text,
    fecha_comprobante: column.text,
    periodo_fiscal: column.text,
    base_imponible: column.text,
    porcentaje_iva: column.text,
    monto_iva: column.text,
    porcentaje_retencion: column.text,
    monto_retenido: column.text,
    status: column.text,
    observaciones: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const retenciones_islr_ventas = new Table(
  {
    empresa_id: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    concepto_islr_id: column.text,
    nro_comprobante: column.text,
    fecha_comprobante: column.text,
    periodo_fiscal: column.text,
    base_imponible_bs: column.text,
    porcentaje_retencion: column.text,
    monto_retenido_bs: column.text,
    sustraendo_bs: column.text,
    status: column.text,
    observaciones: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// PROVEEDORES / COMPRAS / CXP
// =============================================

const proveedores = new Table(
  {
    empresa_id: column.text,
    tipo_persona_id: column.text,
    rif: column.text,
    razon_social: column.text,
    nombre_comercial: column.text,
    direccion_fiscal: column.text,
    ciudad: column.text,
    telefono: column.text,
    email: column.text,
    tipo_contribuyente: column.text,
    retiene_iva: column.integer,
    retiene_islr: column.integer,
    concepto_islr_id: column.text,
    retencion_iva_pct: column.text,
    dias_credito: column.integer,
    limite_credito_usd: column.text,
    saldo_actual: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const proveedores_bancos = new Table(
  {
    empresa_id: column.text,
    proveedor_id: column.text,
    nombre_banco: column.text,
    nro_cuenta: column.text,
    tipo_cuenta: column.text,
    titular: column.text,
    titular_documento: column.text,
    moneda_id: column.text,
    is_active: column.integer,
    created_at: column.text,
  },
  { indexes: {} }
)

const facturas_compra = new Table(
  {
    empresa_id: column.text,
    proveedor_id: column.text,
    nro_factura: column.text,
    nro_control: column.text,
    deposito_id: column.text,
    moneda_id: column.text,
    tasa: column.text,
    total_exento_usd: column.text,
    total_base_usd: column.text,
    total_iva_usd: column.text,
    total_igtf_usd: column.text,
    total_usd: column.text,
    total_bs: column.text,
    saldo_pend_usd: column.text,
    tipo: column.text,
    status: column.text,
    fecha_factura: column.text,
    fecha_recepcion: column.text,
    usuario_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const facturas_compra_det = new Table(
  {
    empresa_id: column.text,
    factura_compra_id: column.text,
    producto_id: column.text,
    deposito_id: column.text,
    cantidad: column.text,
    costo_unitario_usd: column.text,
    tipo_impuesto: column.text,
    impuesto_pct: column.text,
    subtotal_usd: column.text,
    subtotal_bs: column.text,
    lote_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const retenciones_iva = new Table(
  {
    empresa_id: column.text,
    factura_compra_id: column.text,
    proveedor_id: column.text,
    nro_comprobante: column.text,
    fecha_comprobante: column.text,
    periodo_fiscal: column.text,
    base_imponible: column.text,
    porcentaje_iva: column.text,
    monto_iva: column.text,
    porcentaje_retencion: column.text,
    monto_retenido: column.text,
    status: column.text,
    observaciones: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const retenciones_islr = new Table(
  {
    empresa_id: column.text,
    factura_compra_id: column.text,
    proveedor_id: column.text,
    concepto_islr_id: column.text,
    nro_comprobante: column.text,
    fecha_comprobante: column.text,
    periodo_fiscal: column.text,
    base_imponible_bs: column.text,
    porcentaje_retencion: column.text,
    monto_retenido_bs: column.text,
    sustraendo_bs: column.text,
    status: column.text,
    observaciones: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const notas_fiscales_compra = new Table(
  {
    empresa_id: column.text,
    proveedor_id: column.text,
    factura_compra_id: column.text,
    tipo: column.text,
    nro_documento: column.text,
    motivo: column.text,
    moneda_id: column.text,
    tasa: column.text,
    total_exento_usd: column.text,
    total_base_usd: column.text,
    total_iva_usd: column.text,
    total_usd: column.text,
    total_bs: column.text,
    afecta_inventario: column.integer,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const notas_fiscales_compra_det = new Table(
  {
    empresa_id: column.text,
    nota_fiscal_compra_id: column.text,
    producto_id: column.text,
    descripcion: column.text,
    cantidad: column.text,
    precio_unitario_usd: column.text,
    tipo_impuesto: column.text,
    impuesto_pct: column.text,
    subtotal_usd: column.text,
    afecta_inventario: column.integer,
    lote_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const movimientos_cuenta_proveedor = new Table(
  {
    empresa_id: column.text,
    proveedor_id: column.text,
    tipo: column.text,
    referencia: column.text,
    monto: column.text,
    saldo_anterior: column.text,
    saldo_nuevo: column.text,
    observacion: column.text,
    factura_compra_id: column.text,
    doc_origen_id: column.text,
    doc_origen_tipo: column.text,
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

const vencimientos_pagar = new Table(
  {
    empresa_id: column.text,
    factura_compra_id: column.text,
    proveedor_id: column.text,
    nro_cuota: column.integer,
    fecha_vencimiento: column.text,
    monto_original_usd: column.text,
    monto_pagado_usd: column.text,
    saldo_pendiente_usd: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

// =============================================
// CONTABILIDAD
// =============================================

const plan_cuentas = new Table(
  {
    empresa_id: column.text,
    codigo: column.text,
    nombre: column.text,
    tipo: column.text,
    parent_id: column.text,
    nivel: column.integer,
    es_cuenta_detalle: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
    updated_by: column.text,
  },
  { indexes: {} }
)

const gastos = new Table(
  {
    empresa_id: column.text,
    nro_gasto: column.text,
    cuenta_id: column.text,
    proveedor_id: column.text,
    descripcion: column.text,
    fecha: column.text,
    moneda_id: column.text,
    tasa: column.text,
    monto_usd: column.text,
    monto_bs: column.text,
    metodo_cobro_id: column.text,
    banco_empresa_id: column.text,
    referencia: column.text,
    observaciones: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)

// =============================================
// SCHEMA EXPORT
// =============================================

export const AppSchema = new Schema({
  // Catalogos globales
  monedas,
  tipos_persona_ve,
  islr_conceptos_ve,
  tipos_movimiento,
  permisos,
  // Core
  empresas,
  empresas_fiscal_ve,
  usuarios,
  roles,
  rol_permisos,
  tenant_permisos,
  // Configuracion
  tasas_cambio,
  metodos_cobro,
  bancos_empresa,
  cajas,
  impuestos_ve,
  // Inventario
  departamentos,
  marcas,
  unidades,
  unidades_conversion,
  depositos,
  productos,
  inventario_stock,
  movimientos_inventario,
  recetas,
  ajuste_motivos,
  ajustes,
  ajustes_det,
  lotes,
  // Clientes / CxC
  clientes,
  movimientos_cuenta,
  vencimientos_cobrar,
  // Ventas
  ventas,
  ventas_det,
  pagos,
  notas_credito,
  notas_credito_det,
  notas_debito,
  notas_debito_det,
  // Caja / Tesoreria
  sesiones_caja,
  sesiones_caja_detalle,
  movimientos_metodo_cobro,
  movimientos_bancarios,
  // Retenciones ventas
  retenciones_iva_ventas,
  retenciones_islr_ventas,
  // Proveedores / Compras / CxP
  proveedores,
  proveedores_bancos,
  facturas_compra,
  facturas_compra_det,
  retenciones_iva,
  retenciones_islr,
  notas_fiscales_compra,
  notas_fiscales_compra_det,
  movimientos_cuenta_proveedor,
  vencimientos_pagar,
  // Contabilidad
  plan_cuentas,
  gastos,
})

export type Database = (typeof AppSchema)['types']
