// =============================================
// CATALOGOS GLOBALES
// =============================================

export interface Monedas {
  id: string
  codigo_iso: string
  nombre: string
  simbolo: string | null
  decimales: number
  is_active: number
  created_at: string
  updated_at: string
}

export interface TiposPersonaVe {
  id: string
  codigo: string
  nombre: string
  es_entidad_legal: number
  aplica_sustraendo: number
  formato_regexp: string | null
  is_active: number
}

export interface IslrConceptosVe {
  id: string
  codigo_seniat: string
  descripcion: string
  porcentaje_pj: string
  porcentaje_pn: string
  sustraendo_ut: string
  monto_minimo_base: string
  is_active: number
}

export interface TiposMovimiento {
  id: string
  nombre: string
  slug: string
  operacion: string
  requiere_doc: number
  is_active: number
  created_at: string
}

export interface Permisos {
  id: string
  modulo: string
  slug: string
  nombre: string
  descripcion: string | null
  is_active: number
  created_at: string
}

// =============================================
// CORE: Empresa, usuarios, roles
// =============================================

export interface Empresas {
  id: string
  tenant_id: string
  nombre: string
  rif: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  logo_url: string | null
  timezone: string
  moneda_base: string
  config: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface EmpresasFiscalVe {
  id: string
  empresa_id: string
  tipo_contribuyente: string | null
  es_agente_retencion: number
  documento_identidad: string | null
  tipo_documento: string | null
  nro_providencia: string | null
  porcentaje_retencion_iva: string | null
  codigo_sucursal_seniat: string | null
  usa_maquina_fiscal: number
  aplica_igtf: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface Usuarios {
  id: string
  empresa_id: string
  email: string
  nombre: string
  rol_id: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Roles {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  is_system: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface RolPermisos {
  id: string
  rol_id: string
  permiso_id: string
  granted_by: string | null
  granted_at: string
}

export interface TenantPermisos {
  id: string
  tenant_id: string
  permiso_id: string
  habilitado: number
  created_at: string
  updated_at: string
}

// =============================================
// CONFIGURACION
// =============================================

export interface TasasCambio {
  id: string
  empresa_id: string
  moneda_id: string
  valor: string
  fecha: string
  created_at: string
  created_by: string | null
}

export interface MetodosCobro {
  id: string
  empresa_id: string
  nombre: string
  tipo: string
  moneda_id: string
  banco_empresa_id: string | null
  requiere_referencia: number
  saldo_actual: string
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface BancosEmpresa {
  id: string
  empresa_id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string
  titular_documento: string | null
  moneda_id: string
  saldo_actual: string
  cuenta_contable_id: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Cajas {
  id: string
  empresa_id: string
  nombre: string
  ubicacion: string | null
  deposito_id: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ImpuestosVe {
  id: string
  empresa_id: string
  nombre: string
  tipo_tributo: string
  porcentaje: string
  codigo_seniat: string | null
  descripcion: string | null
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

// =============================================
// INVENTARIO
// =============================================

export interface Departamentos {
  id: string
  empresa_id: string
  codigo: string
  nombre: string
  parent_id: string | null
  slug: string | null
  descripcion: string | null
  imagen_url: string | null
  prioridad_visual: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Marcas {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  logo_url: string | null
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface Unidades {
  id: string
  empresa_id: string
  nombre: string
  abreviatura: string
  es_decimal: number
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface UnidadesConversion {
  id: string
  empresa_id: string
  unidad_mayor_id: string
  unidad_menor_id: string
  factor: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface Depositos {
  id: string
  empresa_id: string
  nombre: string
  direccion: string | null
  es_principal: number
  permite_venta: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Productos {
  id: string
  empresa_id: string
  codigo: string
  tipo: string
  nombre: string
  departamento_id: string
  marca_id: string | null
  unidad_base_id: string | null
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string | null
  costo_promedio: string
  costo_ultimo: string
  stock: string
  stock_minimo: string
  tipo_impuesto: string
  impuesto_iva_id: string | null
  impuesto_igtf_id: string | null
  maneja_lotes: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  ubicacion: string | null
  presentacion: string | null
}

export interface InventarioStock {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  cantidad_actual: string
  stock_reservado: string
  updated_at: string
  updated_by: string | null
}

export interface MovimientosInventario {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  tipo_movimiento_id: string | null
  tipo: string
  origen: string
  cantidad: string
  stock_anterior: string
  stock_nuevo: string
  costo_unitario: string | null
  moneda_id: string | null
  tasa_cambio: string | null
  doc_origen_id: string | null
  doc_origen_ref: string | null
  lote_id: string | null
  motivo: string | null
  usuario_id: string
  fecha: string
  created_at: string
}

export interface Recetas {
  id: string
  empresa_id: string
  servicio_id: string
  producto_id: string
  cantidad: string
  created_at: string
}

export interface AjusteMotivos {
  id: string
  empresa_id: string
  nombre: string
  es_sistema: number
  operacion_base: string
  afecta_costo: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Ajustes {
  id: string
  empresa_id: string
  num_ajuste: string
  motivo_id: string
  fecha: string
  observaciones: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface AjustesDet {
  id: string
  ajuste_id: string
  producto_id: string
  deposito_id: string
  cantidad: string
  costo_unitario: string | null
  lote_id: string | null
  lote_nro: string | null
  lote_fecha_fab: string | null
  lote_fecha_venc: string | null
  created_at: string
  created_by: string | null
}

export interface Lotes {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  nro_lote: string
  fecha_fabricacion: string | null
  fecha_vencimiento: string | null
  cantidad_inicial: string
  cantidad_actual: string
  costo_unitario: string | null
  factura_compra_id: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

// =============================================
// CLIENTES / CXC
// =============================================

export interface Clientes {
  id: string
  empresa_id: string
  tipo_persona_id: string | null
  identificacion: string
  nombre: string
  nombre_comercial: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  es_contribuyente_especial: number
  es_agente_retencion_iva: number
  es_agente_retencion_islr: number
  porcentaje_retencion_iva: string | null
  limite_credito_usd: string
  saldo_actual: string
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface MovimientosCuenta {
  id: string
  empresa_id: string
  cliente_id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  venta_id: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

export interface VencimientosCobrar {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  nro_cuota: number
  fecha_vencimiento: string
  monto_original_usd: string
  monto_pagado_usd: string
  saldo_pendiente_usd: string
  status: string
  created_at: string
  updated_at: string
}

// =============================================
// VENTAS
// =============================================

export interface Ventas {
  id: string
  empresa_id: string
  cliente_id: string
  nro_factura: string
  num_control: string | null
  deposito_id: string
  sesion_caja_id: string | null
  moneda_id: string | null
  tasa: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_igtf_usd: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  status: string
  usuario_id: string
  fecha: string
  created_at: string
  created_by: string | null
}

export interface VentasDet {
  id: string
  empresa_id: string
  venta_id: string
  producto_id: string
  deposito_id: string
  cantidad: string
  precio_unitario_usd: string
  tipo_impuesto: string
  impuesto_pct: string
  subtotal_usd: string
  subtotal_bs: string
  lote_id: string | null
  created_at: string
}

export interface Pagos {
  id: string
  empresa_id: string
  venta_id: string | null
  cliente_id: string
  metodo_cobro_id: string
  moneda_id: string
  tasa: string
  monto: string
  monto_usd: string
  referencia: string | null
  sesion_caja_id: string | null
  banco_empresa_id: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

export interface NotasCredito {
  id: string
  empresa_id: string
  nro_ncr: string
  venta_id: string
  cliente_id: string
  tipo: string
  motivo: string
  moneda_id: string | null
  tasa_historica: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_usd: string
  total_bs: string
  afecta_inventario: number
  usuario_id: string
  fecha: string
  created_at: string
}

export interface NotasCreditoDet {
  id: string
  empresa_id: string
  nota_credito_id: string
  producto_id: string | null
  deposito_id: string | null
  cantidad: string
  precio_unitario_usd: string
  tipo_impuesto: string | null
  impuesto_pct: string | null
  subtotal_usd: string
  afecta_inventario: number
  descripcion: string | null
  lote_id: string | null
  created_at: string
}

export interface NotasDebito {
  id: string
  empresa_id: string
  nro_ndb: string
  venta_id: string | null
  cliente_id: string
  motivo: string
  moneda_id: string | null
  tasa: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_usd: string
  total_bs: string
  usuario_id: string
  fecha: string
  created_at: string
}

export interface NotasDebitoDet {
  id: string
  empresa_id: string
  nota_debito_id: string
  descripcion: string
  cantidad: string
  precio_unitario_usd: string
  tipo_impuesto: string | null
  impuesto_pct: string | null
  subtotal_usd: string
  created_at: string
}

// =============================================
// CAJA / TESORERIA
// =============================================

export interface SesionesCaja {
  id: string
  empresa_id: string
  caja_id: string
  usuario_apertura_id: string
  fecha_apertura: string
  monto_apertura_usd: string
  usuario_cierre_id: string | null
  fecha_cierre: string | null
  monto_sistema_usd: string | null
  monto_fisico_usd: string | null
  diferencia_usd: string | null
  observaciones_cierre: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface SesionesCajaDetalle {
  id: string
  sesion_caja_id: string
  metodo_cobro_id: string
  moneda_id: string
  total_sistema: string
  total_fisico: string | null
  diferencia: string | null
  num_transacciones: number
  created_at: string
}

export interface MovimientosMetodoCobro {
  id: string
  empresa_id: string
  metodo_cobro_id: string
  tipo: string
  origen: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  doc_origen_id: string | null
  doc_origen_ref: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

export interface MovimientosBancarios {
  id: string
  empresa_id: string
  banco_empresa_id: string
  tipo: string
  origen: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  referencia: string | null
  validado: number
  validado_por: string | null
  validado_at: string | null
  observacion: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

// =============================================
// RETENCIONES VENTAS
// =============================================

export interface RetencionesIvaVentas {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible: string
  porcentaje_iva: string
  monto_iva: string
  porcentaje_retencion: string
  monto_retenido: string
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export interface RetencionesIslrVentas {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  concepto_islr_id: string | null
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible_bs: string
  porcentaje_retencion: string
  monto_retenido_bs: string
  sustraendo_bs: string | null
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

// =============================================
// PROVEEDORES / COMPRAS / CXP
// =============================================

export interface Proveedores {
  id: string
  empresa_id: string
  tipo_persona_id: string | null
  rif: string
  razon_social: string
  nombre_comercial: string | null
  direccion_fiscal: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  tipo_contribuyente: string | null
  retiene_iva: number
  retiene_islr: number
  concepto_islr_id: string | null
  retencion_iva_pct: string | null
  dias_credito: number
  limite_credito_usd: string
  saldo_actual: string
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ProveedoresBancos {
  id: string
  empresa_id: string
  proveedor_id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string | null
  titular_documento: string | null
  moneda_id: string | null
  is_active: number
  created_at: string
}

export interface FacturasCompra {
  id: string
  empresa_id: string
  proveedor_id: string
  nro_factura: string
  nro_control: string | null
  deposito_id: string
  moneda_id: string | null
  tasa: string
  tasa_costo: string | null  // BCV/internal rate for cost calc (tasa paralela)
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_igtf_usd: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  status: string
  fecha_factura: string
  fecha_recepcion: string | null
  usuario_id: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface FacturasCompraDet {
  id: string
  empresa_id: string
  factura_compra_id: string
  producto_id: string
  deposito_id: string
  cantidad: string
  costo_unitario_usd: string      // original invoice cost in USD
  costo_usd_sistema: string | null // BCV-adjusted cost (inventory valuation)
  tipo_impuesto: string
  impuesto_pct: string
  subtotal_usd: string
  subtotal_bs: string
  lote_id: string | null
  created_at: string
}

export interface RetencionesIva {
  id: string
  empresa_id: string
  factura_compra_id: string
  proveedor_id: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible: string
  porcentaje_iva: string
  monto_iva: string
  porcentaje_retencion: string
  monto_retenido: string
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export interface RetencionesIslr {
  id: string
  empresa_id: string
  factura_compra_id: string
  proveedor_id: string
  concepto_islr_id: string | null
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible_bs: string
  porcentaje_retencion: string
  monto_retenido_bs: string
  sustraendo_bs: string | null
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export interface NotasFiscalesCompra {
  id: string
  empresa_id: string
  proveedor_id: string
  factura_compra_id: string | null
  tipo: string
  nro_documento: string
  motivo: string
  moneda_id: string | null
  tasa: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_usd: string
  total_bs: string
  afecta_inventario: number
  usuario_id: string
  fecha: string
  created_at: string
}

export interface NotasFiscalesCompraDet {
  id: string
  empresa_id: string
  nota_fiscal_compra_id: string
  producto_id: string | null
  descripcion: string
  cantidad: string
  precio_unitario_usd: string
  tipo_impuesto: string | null
  impuesto_pct: string | null
  subtotal_usd: string
  afecta_inventario: number
  lote_id: string | null
  created_at: string
}

export interface MovimientosCuentaProveedor {
  id: string
  empresa_id: string
  proveedor_id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  factura_compra_id: string | null
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

export interface VencimientosPagar {
  id: string
  empresa_id: string
  factura_compra_id: string
  proveedor_id: string
  nro_cuota: number
  fecha_vencimiento: string
  monto_original_usd: string
  monto_pagado_usd: string
  saldo_pendiente_usd: string
  status: string
  created_at: string
  updated_at: string
}

// =============================================
// CONTABILIDAD
// =============================================

export interface PlanCuentas {
  id: string
  empresa_id: string
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  parent_id: string | null
  nivel: number
  es_cuenta_detalle: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Gastos {
  id: string
  empresa_id: string
  nro_gasto: string
  cuenta_id: string
  proveedor_id: string | null
  descripcion: string
  fecha: string
  moneda_id: string
  tasa: string
  monto_usd: string
  metodo_cobro_id: string | null
  banco_empresa_id: string | null
  referencia: string | null
  observaciones: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface CuentasConfig {
  id: string
  empresa_id: string
  clave: string
  cuenta_contable_id: string
  descripcion: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface LibroContable {
  id: string
  empresa_id: string
  nro_asiento: string
  fecha_registro: string
  modulo_origen: string
  doc_origen_id: string | null
  doc_origen_ref: string | null
  cuenta_contable_id: string
  banco_empresa_id: string | null
  monto: string
  detalle: string
  estado: string
  parent_id: string | null
  usuario_id: string
  created_at: string
}

export interface GastoPagos {
  id: string
  empresa_id: string
  gasto_id: string
  metodo_cobro_id: string | null
  banco_empresa_id: string | null
  monto_usd: string
  referencia: string | null
  created_at: string
}

// =============================================
// DB INTERFACE (mapeo nombre_tabla -> Interface)
// =============================================

export interface DB {
  // Catalogos globales
  monedas: Monedas
  tipos_persona_ve: TiposPersonaVe
  islr_conceptos_ve: IslrConceptosVe
  tipos_movimiento: TiposMovimiento
  permisos: Permisos
  // Core
  empresas: Empresas
  empresas_fiscal_ve: EmpresasFiscalVe
  usuarios: Usuarios
  roles: Roles
  rol_permisos: RolPermisos
  tenant_permisos: TenantPermisos
  // Configuracion
  tasas_cambio: TasasCambio
  metodos_cobro: MetodosCobro
  bancos_empresa: BancosEmpresa
  cajas: Cajas
  impuestos_ve: ImpuestosVe
  // Inventario
  departamentos: Departamentos
  marcas: Marcas
  unidades: Unidades
  unidades_conversion: UnidadesConversion
  depositos: Depositos
  productos: Productos
  inventario_stock: InventarioStock
  movimientos_inventario: MovimientosInventario
  recetas: Recetas
  ajuste_motivos: AjusteMotivos
  ajustes: Ajustes
  ajustes_det: AjustesDet
  lotes: Lotes
  // Clientes / CxC
  clientes: Clientes
  movimientos_cuenta: MovimientosCuenta
  vencimientos_cobrar: VencimientosCobrar
  // Ventas
  ventas: Ventas
  ventas_det: VentasDet
  pagos: Pagos
  notas_credito: NotasCredito
  notas_credito_det: NotasCreditoDet
  notas_debito: NotasDebito
  notas_debito_det: NotasDebitoDet
  // Caja / Tesoreria
  sesiones_caja: SesionesCaja
  sesiones_caja_detalle: SesionesCajaDetalle
  movimientos_metodo_cobro: MovimientosMetodoCobro
  movimientos_bancarios: MovimientosBancarios
  // Retenciones ventas
  retenciones_iva_ventas: RetencionesIvaVentas
  retenciones_islr_ventas: RetencionesIslrVentas
  // Proveedores / Compras / CxP
  proveedores: Proveedores
  proveedores_bancos: ProveedoresBancos
  facturas_compra: FacturasCompra
  facturas_compra_det: FacturasCompraDet
  retenciones_iva: RetencionesIva
  retenciones_islr: RetencionesIslr
  notas_fiscales_compra: NotasFiscalesCompra
  notas_fiscales_compra_det: NotasFiscalesCompraDet
  movimientos_cuenta_proveedor: MovimientosCuentaProveedor
  vencimientos_pagar: VencimientosPagar
  // Contabilidad
  plan_cuentas: PlanCuentas
  gastos: Gastos
  gasto_pagos: GastoPagos
  cuentas_config: CuentasConfig
  libro_contable: LibroContable
}
