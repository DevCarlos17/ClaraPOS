import { z } from 'zod'

export const cuentasConfigSchema = z.object({
  cuenta_contable_id: z.string().uuid('Selecciona una cuenta contable valida'),
})

export type CuentasConfigFormValues = z.infer<typeof cuentasConfigSchema>

// Claves conocidas con su descripcion para UI
export const CLAVES_CONFIG: Record<string, string> = {
  CAJA_EFECTIVO: 'Efectivo en caja',
  CAJA_CHICA: 'Caja chica',
  BANCO_DEFAULT: 'Bancos (cuenta generica)',
  CXC_CLIENTES: 'Cuentas por cobrar clientes',
  INVENTARIO: 'Inventario de mercancia',
  IVA_CREDITO: 'IVA credito fiscal',
  RET_IVA_SOPORTADA: 'Retenciones IVA soportadas',
  RET_ISLR_SOPORTADA: 'Retenciones ISLR soportadas',
  CXP_PROVEEDORES: 'Cuentas por pagar proveedores',
  IVA_DEBITO: 'IVA debito fiscal',
  RET_IVA_POR_ENTERAR: 'Retenciones IVA por enterar',
  RET_ISLR_POR_ENTERAR: 'Retenciones ISLR por enterar',
  IGTF_POR_PAGAR: 'IGTF por pagar',
  INGRESO_VENTA_PRODUCTO: 'Ventas de productos',
  INGRESO_VENTA_SERVICIO: 'Servicios prestados',
  DESCUENTO_VENTAS: 'Descuentos en ventas',
  DEVOLUCION_VENTAS: 'Devoluciones en ventas',
  COSTO_VENTA: 'Costo de mercancia vendida',
  GANANCIA_DIFERENCIAL_CAMBIARIO: 'Ganancia por diferencial cambiario',
  PERDIDA_DIFERENCIAL_CAMBIARIO: 'Perdida por diferencial cambiario',
}
