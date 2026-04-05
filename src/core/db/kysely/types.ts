export interface Empresas {
  id: string
  nombre: string
  rif: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  nro_fiscal: string | null
  regimen: string | null
  activo: number
  created_at: string
  updated_at: string
}

export interface Usuarios {
  id: string
  email: string
  nombre: string
  level: number
  empresa_id: string | null
  activo: number
  created_at: string
  updated_at: string
}

export interface TasasCambio {
  id: string
  fecha: string
  valor: string
  moneda_destino: string
  empresa_id: string | null
  created_at: string
}

export interface Departamentos {
  id: string
  codigo: string
  nombre: string
  activo: number
  empresa_id: string | null
  created_at: string
  updated_at: string
}

export interface Productos {
  id: string
  codigo: string
  tipo: string
  nombre: string
  departamento_id: string
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string | null
  stock: string
  stock_minimo: string
  medida: string
  activo: number
  empresa_id: string | null
  created_at: string
  updated_at: string
}

export interface Recetas {
  id: string
  servicio_id: string
  producto_id: string
  cantidad: string
  empresa_id: string | null
  created_at: string
}

export interface MovimientosInventario {
  id: string
  producto_id: string
  tipo: string
  origen: string
  cantidad: string
  stock_anterior: string
  stock_nuevo: string
  motivo: string | null
  usuario_id: string
  fecha: string
  venta_id: string | null
  empresa_id: string | null
  created_at: string
}

export interface MetodosPago {
  id: string
  nombre: string
  moneda: string
  activo: number
  empresa_id: string | null
  created_at: string
}

export interface Bancos {
  id: string
  banco: string
  numero_cuenta: string
  cedula_rif: string
  activo: number
  empresa_id: string | null
  created_at: string
}

export interface Clientes {
  id: string
  identificacion: string
  nombre_social: string
  direccion: string | null
  telefono: string | null
  limite_credito: string
  saldo_actual: string
  activo: number
  empresa_id: string | null
  created_at: string
  updated_at: string
}

export interface MovimientosCuenta {
  id: string
  cliente_id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  venta_id: string | null
  fecha: string
  empresa_id: string | null
  created_at: string
}

export interface Ventas {
  id: string
  cliente_id: string
  nro_factura: string | null
  tasa: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  usuario_id: string
  fecha: string
  created_at: string
  anulada: number
  empresa_id: string | null
}

export interface DetalleVenta {
  id: string
  venta_id: string
  producto_id: string
  cantidad: string
  precio_unitario_usd: string
  empresa_id: string | null
  created_at: string
}

export interface Pagos {
  id: string
  venta_id: string | null
  cliente_id: string
  metodo_pago_id: string
  moneda: string
  tasa: string
  monto: string
  monto_usd: string
  referencia: string | null
  fecha: string
  empresa_id: string | null
  created_at: string
}

export interface NotasCredito {
  id: string
  nro_ncr: string
  venta_id: string
  cliente_id: string
  motivo: string
  tasa_historica: string
  monto_total_usd: string
  monto_total_bs: string
  usuario_id: string
  fecha: string
  empresa_id: string | null
  created_at: string
}

export interface Proveedores {
  id: string
  razon_social: string
  rif: string
  direccion_fiscal: string | null
  telefono: string | null
  correo: string | null
  retiene_iva: number
  retiene_islr: number
  activo: number
  empresa_id: string | null
  created_at: string
  updated_at: string
}

export interface Compras {
  id: string
  proveedor_id: string
  nro_compra: string
  tasa: string
  total_usd: string
  total_bs: string
  usuario_id: string
  fecha: string
  empresa_id: string | null
  created_at: string
}

export interface DetalleCompra {
  id: string
  compra_id: string
  producto_id: string
  cantidad: string
  costo_unitario_usd: string
  empresa_id: string | null
  created_at: string
}

export interface LevelPermissions {
  id: string
  level: number
  permission: string
  created_at: string
}

export interface DB {
  empresas: Empresas
  usuarios: Usuarios
  tasas_cambio: TasasCambio
  departamentos: Departamentos
  productos: Productos
  recetas: Recetas
  movimientos_inventario: MovimientosInventario
  metodos_pago: MetodosPago
  bancos: Bancos
  clientes: Clientes
  movimientos_cuenta: MovimientosCuenta
  ventas: Ventas
  detalle_venta: DetalleVenta
  pagos: Pagos
  notas_credito: NotasCredito
  proveedores: Proveedores
  compras: Compras
  detalle_compra: DetalleCompra
  level_permissions: LevelPermissions
}
