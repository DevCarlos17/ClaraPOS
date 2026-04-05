import { column, Schema, Table } from '@powersync/web'

const empresas = new Table(
  {
    nombre: column.text,
    rif: column.text,
    direccion: column.text,
    telefono: column.text,
    email: column.text,
    nro_fiscal: column.text,
    regimen: column.text,
    activo: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const usuarios = new Table(
  {
    email: column.text,
    nombre: column.text,
    level: column.integer,
    empresa_id: column.text,
    activo: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const tasas_cambio = new Table(
  {
    fecha: column.text,
    valor: column.text,
    moneda_destino: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const departamentos = new Table(
  {
    codigo: column.text,
    nombre: column.text,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const productos = new Table(
  {
    codigo: column.text,
    tipo: column.text,
    nombre: column.text,
    departamento_id: column.text,
    costo_usd: column.text,
    precio_venta_usd: column.text,
    precio_mayor_usd: column.text,
    stock: column.text,
    stock_minimo: column.text,
    medida: column.text,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const recetas = new Table(
  {
    servicio_id: column.text,
    producto_id: column.text,
    cantidad: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const movimientos_inventario = new Table(
  {
    producto_id: column.text,
    tipo: column.text,
    origen: column.text,
    cantidad: column.text,
    stock_anterior: column.text,
    stock_nuevo: column.text,
    motivo: column.text,
    usuario_id: column.text,
    fecha: column.text,
    venta_id: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const metodos_pago = new Table(
  {
    nombre: column.text,
    moneda: column.text,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const bancos = new Table(
  {
    banco: column.text,
    numero_cuenta: column.text,
    cedula_rif: column.text,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const clientes = new Table(
  {
    identificacion: column.text,
    nombre_social: column.text,
    direccion: column.text,
    telefono: column.text,
    limite_credito: column.text,
    saldo_actual: column.text,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const movimientos_cuenta = new Table(
  {
    cliente_id: column.text,
    tipo: column.text,
    referencia: column.text,
    monto: column.text,
    saldo_anterior: column.text,
    saldo_nuevo: column.text,
    observacion: column.text,
    venta_id: column.text,
    fecha: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const ventas = new Table(
  {
    cliente_id: column.text,
    nro_factura: column.text,
    tasa: column.text,
    total_usd: column.text,
    total_bs: column.text,
    saldo_pend_usd: column.text,
    tipo: column.text,
    usuario_id: column.text,
    fecha: column.text,
    created_at: column.text,
    anulada: column.integer,
    empresa_id: column.text,
  },
  { indexes: {} }
)

const detalle_venta = new Table(
  {
    venta_id: column.text,
    producto_id: column.text,
    cantidad: column.text,
    precio_unitario_usd: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const pagos = new Table(
  {
    venta_id: column.text,
    cliente_id: column.text,
    metodo_pago_id: column.text,
    moneda: column.text,
    tasa: column.text,
    monto: column.text,
    monto_usd: column.text,
    referencia: column.text,
    fecha: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const proveedores = new Table(
  {
    razon_social: column.text,
    rif: column.text,
    direccion_fiscal: column.text,
    telefono: column.text,
    correo: column.text,
    retiene_iva: column.integer,
    retiene_islr: column.integer,
    activo: column.integer,
    empresa_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: {} }
)

const compras = new Table(
  {
    proveedor_id: column.text,
    nro_compra: column.text,
    tasa: column.text,
    total_usd: column.text,
    total_bs: column.text,
    usuario_id: column.text,
    fecha: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const detalle_compra = new Table(
  {
    compra_id: column.text,
    producto_id: column.text,
    cantidad: column.text,
    costo_unitario_usd: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const notas_credito = new Table(
  {
    nro_ncr: column.text,
    venta_id: column.text,
    cliente_id: column.text,
    motivo: column.text,
    tasa_historica: column.text,
    monto_total_usd: column.text,
    monto_total_bs: column.text,
    usuario_id: column.text,
    fecha: column.text,
    empresa_id: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

const level_permissions = new Table(
  {
    level: column.integer,
    permission: column.text,
    created_at: column.text,
  },
  { indexes: {} }
)

export const AppSchema = new Schema({
  empresas,
  usuarios,
  tasas_cambio,
  departamentos,
  productos,
  recetas,
  movimientos_inventario,
  metodos_pago,
  bancos,
  clientes,
  movimientos_cuenta,
  ventas,
  detalle_venta,
  pagos,
  notas_credito,
  proveedores,
  compras,
  detalle_compra,
  level_permissions,
})

export type Database = (typeof AppSchema)['types']
