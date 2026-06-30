import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'

export interface PaymentMethod {
  id: string
  nombre: string
  tipo: string
  moneda_id: string
  /** Alias de moneda_id para retrocompatibilidad (USD / VES) */
  moneda: string
  banco_empresa_id: string | null
  banco_nombre: string | null
  caja_fuerte_id: string | null
  caja_nombre: string | null
  requiere_referencia: number
  saldo_actual: string
  is_active: number
  empresa_id: string
  created_at: string
  // 0069: atributos operativos
  deposito_directo: number   // 0|1
  comision_pct: string
  usa_pos: number            // 0|1
  usa_cxc: number            // 0|1
  usa_cxp: number            // 0|1
}

export const TIPOS_METODO = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'PUNTO', label: 'Punto de Venta' },
  { value: 'PAGO_MOVIL', label: 'Pago Movil' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'DIVISA_DIGITAL', label: 'Divisa Digital' },
  { value: 'OTRO', label: 'Otro' },
] as const

const SELECT_METODOS = `
  SELECT mc.*,
         CASE WHEN m.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(m.codigo_iso, 'USD') END as moneda,
         b.nombre_banco as banco_nombre,
         cf.nombre as caja_nombre
  FROM metodos_cobro mc
  LEFT JOIN monedas m ON mc.moneda_id = m.id
  LEFT JOIN bancos_empresa b ON mc.banco_empresa_id = b.id
  LEFT JOIN caja_fuerte cf ON mc.caja_fuerte_id = cf.id
`

export function usePaymentMethods() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `${SELECT_METODOS} WHERE mc.empresa_id = ? ORDER BY mc.nombre ASC`,
    [empresaId]
  )
  return { methods: (data ?? []) as PaymentMethod[], isLoading }
}

export function useMetodosPagoActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `${SELECT_METODOS} WHERE mc.empresa_id = ? AND mc.is_active = 1 ORDER BY mc.nombre ASC`,
    [empresaId]
  )
  return { metodos: (data ?? []) as PaymentMethod[], isLoading }
}

export async function createPaymentMethod(params: {
  nombre: string
  moneda: 'USD' | 'BS'
  tipo: string
  banco_empresa_id?: string
  requiere_referencia?: boolean
  empresa_id: string
  usuario_id: string
  // 0069: atributos operativos
  deposito_directo?: boolean
  comision_pct?: string
  usa_pos?: boolean
  usa_cxc?: boolean
  usa_cxp?: boolean
  caja_fuerte_id?: string | null
}) {
  const id = uuidv4()
  const now = localNow()
  const comisionStorage = new Decimal(params.comision_pct || '0').toFixed(2)

  await db.writeTransaction(async (tx) => {
    // Buscar UUID de moneda
    const monedaCode = params.moneda === 'BS' ? 'VES' : 'USD'
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [monedaCode]
    )
    if (!monedaResult.rows?.length) {
      throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    await tx.execute(
      `INSERT INTO metodos_cobro
         (id, empresa_id, nombre, tipo, moneda_id, banco_empresa_id,
          requiere_referencia, saldo_actual, is_active,
          created_at, updated_at, created_by,
          deposito_directo, comision_pct, usa_pos, usa_cxc, usa_cxp, caja_fuerte_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.empresa_id,
        params.nombre.toUpperCase(),
        params.tipo,
        monedaId,
        params.banco_empresa_id ?? null,
        params.requiere_referencia ? 1 : 0,
        '0.00',
        1,
        now,
        now,
        params.usuario_id,
        params.deposito_directo ? 1 : 0,
        comisionStorage,
        params.usa_pos !== false ? 1 : 0,
        params.usa_cxc !== false ? 1 : 0,
        params.usa_cxp !== false ? 1 : 0,
        params.caja_fuerte_id ?? null,
      ]
    )
  })

  return id
}

export async function updatePaymentMethod(
  id: string,
  data: {
    nombre?: string
    tipo?: string
    banco_empresa_id?: string | null
    is_active?: boolean
    // 0069: atributos operativos
    deposito_directo?: boolean
    comision_pct?: string
    usa_pos?: boolean
    usa_cxc?: boolean
    usa_cxp?: boolean
    caja_fuerte_id?: string | null
  }
) {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.nombre !== undefined) {
    sets.push('nombre = ?')
    values.push(data.nombre.toUpperCase())
  }
  if (data.tipo !== undefined) {
    sets.push('tipo = ?')
    values.push(data.tipo)
  }
  if (data.banco_empresa_id !== undefined) {
    sets.push('banco_empresa_id = ?')
    values.push(data.banco_empresa_id)
  }
  if (data.is_active !== undefined) {
    sets.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }
  if (data.deposito_directo !== undefined) {
    sets.push('deposito_directo = ?')
    values.push(data.deposito_directo ? 1 : 0)
  }
  if (data.comision_pct !== undefined) {
    sets.push('comision_pct = ?')
    values.push(new Decimal(data.comision_pct || '0').toFixed(2))
  }
  if (data.usa_pos !== undefined) {
    sets.push('usa_pos = ?')
    values.push(data.usa_pos ? 1 : 0)
  }
  if (data.usa_cxc !== undefined) {
    sets.push('usa_cxc = ?')
    values.push(data.usa_cxc ? 1 : 0)
  }
  if (data.usa_cxp !== undefined) {
    sets.push('usa_cxp = ?')
    values.push(data.usa_cxp ? 1 : 0)
  }
  if (data.caja_fuerte_id !== undefined) {
    sets.push('caja_fuerte_id = ?')
    values.push(data.caja_fuerte_id)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)

  await db.execute(`UPDATE metodos_cobro SET ${sets.join(', ')} WHERE id = ?`, values)
}
