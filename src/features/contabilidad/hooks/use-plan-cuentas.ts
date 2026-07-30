import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { TipoCuenta, NaturalezaCuenta } from '@/features/contabilidad/schemas/cuenta-schema'

// ─── Interfaces ─────────────────────────────────────────────

export interface CuentaContable {
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

export interface GrupoConSubcuentas extends CuentaContable {
  subcuentas: CuentaContable[]
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Plan de cuentas completo de la empresa, ordenado por codigo ascendente.
 */
export function usePlanCuentas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM plan_cuentas WHERE empresa_id = ? ORDER BY codigo ASC',
    [empresaId]
  )

  // IDs de cuentas vinculadas al sistema (no pueden desactivarse)
  const { data: configData } = useQuery(
    'SELECT cuenta_contable_id FROM cuentas_config WHERE empresa_id = ?',
    [empresaId]
  )

  const sistemaCuentaIds = useMemo(() => {
    const set = new Set<string>()
    for (const row of (configData ?? []) as { cuenta_contable_id: string }[]) {
      if (row.cuenta_contable_id) set.add(row.cuenta_contable_id)
    }
    return set
  }, [configData])

  return {
    cuentas: (data ?? []) as CuentaContable[],
    isLoading,
    sistemaCuentaIds,
  }
}

/**
 * Solo cuentas de detalle activas (es_cuenta_detalle = 1 AND is_active = 1).
 * Estas son las unicas que pueden usarse en transacciones.
 */
export function useCuentasDetalle() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM plan_cuentas
     WHERE empresa_id = ? AND es_cuenta_detalle = 1 AND is_active = 1
     ORDER BY codigo ASC`,
    [empresaId]
  )

  return { cuentas: (data ?? []) as CuentaContable[], isLoading }
}

/**
 * Cuentas de detalle activas filtradas por tipo.
 */
export function useCuentasDetallePorTipo(tipo: TipoCuenta | TipoCuenta[]) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const tipos = Array.isArray(tipo) ? tipo : [tipo]
  const placeholders = tipos.map(() => '?').join(',')

  const { data, isLoading } = useQuery(
    `SELECT * FROM plan_cuentas
     WHERE empresa_id = ? AND es_cuenta_detalle = 1 AND is_active = 1
       AND tipo IN (${placeholders})
     ORDER BY codigo ASC`,
    [empresaId, ...tipos]
  )

  return { cuentas: (data ?? []) as CuentaContable[], isLoading }
}

/**
 * @deprecated Superado por la migracion 0081 (PR-2b): `6.2.05` queda
 * desactivado (`is_active = 0`) en favor de la jerarquia de 4 niveles
 * (`6.1.25.01 COMISIONES DE PASARELAS DE PAGO` / `6.2.06.01 COMISIONES
 * BANCARIAS`, ver `useGrupoComisionesPasarela`/`useGrupoComisionesBancarias`).
 * Se conserva sin cambios de comportamiento unicamente porque `banco-form.tsx`
 * (slice 3b.3, aun no migrado) sigue consumiendola. Sera eliminada cuando ese
 * archivo se actualice para usar los nuevos resolvers.
 */
export function useSubgrupoComisionesBancarias(): { id: string; codigo: '6.2.05'; nivel: 3 } | undefined {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data } = useQuery(
    `SELECT id, codigo, nivel FROM plan_cuentas WHERE empresa_id = ? AND codigo = '6.2.05' LIMIT 1`,
    [empresaId]
  )

  const row = (data ?? [])[0] as { id: string; codigo: string; nivel: number } | undefined
  if (!row) return undefined
  return { id: row.id, codigo: '6.2.05', nivel: 3 }
}

/**
 * Resuelve un grupo del plan de cuentas por su clave en `cuentas_config`, en
 * vez de asumir un `codigo` hardcoded. Mecanismo generico compartido por
 * `useGrupoComisionesBancarias`/`useGrupoComisionesPasarela` (PR-2b).
 */
function useGrupoPorClaveConfig(clave: string): { id: string; codigo: string; nivel: number } | undefined {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data } = useQuery(
    `SELECT pc.id AS id, pc.codigo AS codigo, pc.nivel AS nivel
     FROM cuentas_config cc
     JOIN plan_cuentas pc ON pc.id = cc.cuenta_contable_id
     WHERE cc.empresa_id = ? AND cc.clave = ?
     LIMIT 1`,
    [empresaId, clave]
  )

  const row = (data ?? [])[0] as { id: string; codigo: string; nivel: number } | undefined
  return row ? { id: row.id, codigo: row.codigo, nivel: row.nivel } : undefined
}

/**
 * Grupo `COMISIONES BANCARIAS` (codigo `6.2.06.01` tras la migracion 0081)
 * resuelto vía `cuentas_config['GRUPO_COMISIONES_BANCARIAS']`. Fuente de
 * padre para la leaf de comision BANCARIA que se auto-crea por banco.
 * Reemplaza `useSubgrupoComisionesBancarias` (hardcode `6.2.05`, superado).
 */
export function useGrupoComisionesBancarias(): { id: string; codigo: string; nivel: number } | undefined {
  return useGrupoPorClaveConfig('GRUPO_COMISIONES_BANCARIAS')
}

/**
 * Grupo `COMISIONES DE PASARELAS DE PAGO` (codigo `6.1.25.01` tras la
 * migracion 0081) resuelto vía `cuentas_config['GRUPO_COMISIONES_PASARELA']`.
 * Fuente de padre para la leaf BASE de comision de PASARELA que se
 * auto-crea por banco (compartida por los metodos de cobro sin cuenta propia).
 */
export function useGrupoComisionesPasarela(): { id: string; codigo: string; nivel: number } | undefined {
  return useGrupoPorClaveConfig('GRUPO_COMISIONES_PASARELA')
}

/**
 * Grupos de tipo GASTO con sus subcuentas de movimiento.
 * Usado en el modal de gestion de cuentas de gasto y en los selectores de
 * registro manual de gasto (`gastos-dashboard.tsx`, `gasto-list.tsx`,
 * `cuenta-gasto-modal.tsx`).
 *
 * Cada hoja (`es_cuenta_detalle = 1`) se atribuye a su grupo PADRE DIRECTO
 * (por `parent_id`) — no a niveles superiores. Esto es correcto sin importar
 * cuantos niveles de anidamiento tenga el arbol: un grupo que organiza
 * puramente subgrupos (sin hojas propias directas, ej. `6.1.25 GASTOS DE
 * VENTA` o `6.2.06 GASTOS FINANCIEROS` de la migracion 0081) nunca recibe
 * hojas y por lo tanto queda EXCLUIDO del resultado — evita que aparezcan
 * como entradas fantasma vacias en los selectores (ver tasks.md 3b.2.7). Los
 * grupos que SI son padres directos de hojas (ej. `6.1.25.01`/`6.2.06.01`,
 * o cualquier grupo de 2 niveles preexistente) se muestran normalmente con
 * sus hojas, sin duplicacion entre niveles.
 */
export function useGruposGastoConSubcuentas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM plan_cuentas WHERE empresa_id = ? AND tipo = 'GASTO' ORDER BY codigo ASC`,
    [empresaId]
  )

  const all = (data ?? []) as CuentaContable[]
  const grupos = all.filter((c) => c.es_cuenta_detalle === 0)
  const subcuentas = all.filter((c) => c.es_cuenta_detalle === 1)

  const subcuentasPorGrupoId = new Map<string, CuentaContable[]>()
  for (const sub of subcuentas) {
    if (!sub.parent_id) continue
    const arr = subcuentasPorGrupoId.get(sub.parent_id) ?? []
    arr.push(sub)
    subcuentasPorGrupoId.set(sub.parent_id, arr)
  }

  const gruposConSubs: GrupoConSubcuentas[] = grupos
    .map((g) => ({
      ...g,
      subcuentas: subcuentasPorGrupoId.get(g.id) ?? [],
    }))
    .filter((g) => g.subcuentas.length > 0)

  return { grupos: gruposConSubs, isLoading }
}

/**
 * Conjunto de cuenta_ids que tienen al menos un gasto REGISTRADO.
 * Usado para determinar si una cuenta puede ser eliminada.
 */
export function useCuentaIdsConGastos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data } = useQuery(
    `SELECT DISTINCT cuenta_id FROM gastos WHERE empresa_id = ?`,
    [empresaId]
  )

  return new Set((data ?? []).map((r: Record<string, unknown>) => r.cuenta_id as string))
}

// ─── Funciones de escritura ──────────────────────────────────

export async function crearCuenta(data: {
  codigo: string
  nombre: string
  tipo: TipoCuenta
  naturaleza: NaturalezaCuenta
  parent_id?: string
  nivel: number
  es_cuenta_detalle: boolean
  empresa_id: string
  created_by?: string
}): Promise<string> {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('plan_cuentas')
    .values({
      id,
      empresa_id: data.empresa_id,
      codigo: data.codigo.toUpperCase(),
      nombre: data.nombre.toUpperCase(),
      tipo: data.tipo,
      naturaleza: data.naturaleza,
      parent_id: data.parent_id ?? null,
      nivel: data.nivel,
      es_cuenta_detalle: data.es_cuenta_detalle ? 1 : 0,
      is_active: 1,
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
      updated_by: null,
    })
    .execute()

  return id
}

/**
 * Actualiza una cuenta contable.
 * NOTA: El codigo es inmutable despues de la creacion.
 */
export async function actualizarCuenta(
  id: string,
  data: {
    nombre?: string
    tipo?: TipoCuenta
    naturaleza?: NaturalezaCuenta
    parent_id?: string | null
    nivel?: number
    es_cuenta_detalle?: boolean
    is_active?: boolean
    updated_by?: string
  }
): Promise<void> {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.tipo !== undefined) updates.tipo = data.tipo
  if (data.naturaleza !== undefined) updates.naturaleza = data.naturaleza
  if (data.parent_id !== undefined) updates.parent_id = data.parent_id ?? null
  if (data.nivel !== undefined) updates.nivel = data.nivel
  if (data.es_cuenta_detalle !== undefined)
    updates.es_cuenta_detalle = data.es_cuenta_detalle ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by ?? null

  await kysely.updateTable('plan_cuentas').set(updates).where('id', '=', id).execute()
}

/**
 * Crea un grupo GASTO con sus subcuentas de movimiento.
 * El codigo se genera automaticamente: 6.{n} para el grupo, 6.{n}.{m:02} para subcuentas.
 */
export async function crearGrupoGastoConSubcuentas(params: {
  nombreGrupo: string
  subcuentas: string[]
  empresaId: string
  userId: string
}): Promise<{ grupoId: string }> {
  const grupoId = uuidv4()
  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // Auto-codigo: contar grupos GASTO existentes para determinar el siguiente
    const cntResult = await tx.execute(
      `SELECT COUNT(*) as cnt FROM plan_cuentas WHERE empresa_id = ? AND tipo = 'GASTO' AND es_cuenta_detalle = 0`,
      [params.empresaId]
    )
    const cnt = Number((cntResult.rows?.item(0) as { cnt: number } | undefined)?.cnt ?? 0)
    const codigoGrupo = `6.${cnt + 1}`

    await tx.execute(
      `INSERT INTO plan_cuentas
         (id, empresa_id, codigo, nombre, tipo, naturaleza, parent_id, nivel, es_cuenta_detalle, is_active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'GASTO', 'DEUDORA', NULL, 2, 0, 1, ?, ?, ?, NULL)`,
      [grupoId, params.empresaId, codigoGrupo, params.nombreGrupo.trim().toUpperCase(), now, now, params.userId]
    )

    for (let i = 0; i < params.subcuentas.length; i++) {
      const codigoSub = `${codigoGrupo}.${String(i + 1).padStart(2, '0')}`
      const subId = uuidv4()
      await tx.execute(
        `INSERT INTO plan_cuentas
           (id, empresa_id, codigo, nombre, tipo, naturaleza, parent_id, nivel, es_cuenta_detalle, is_active, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 'GASTO', 'DEUDORA', ?, 3, 1, 1, ?, ?, ?, NULL)`,
        [subId, params.empresaId, codigoSub, params.subcuentas[i].trim().toUpperCase(), grupoId, now, now, params.userId]
      )
    }
  })
  return { grupoId }
}

/**
 * Agrega una subcuenta de movimiento a un grupo GASTO existente.
 * El codigo se genera automaticamente: {grupoCodigo}.{n:02}.
 */
export async function agregarSubcuentaAGrupo(params: {
  grupoId: string
  grupoCodigo: string
  grupoNivel: number
  nombreSubcuenta: string
  empresaId: string
  userId: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const now = localNow()

    const cntResult = await tx.execute(
      `SELECT COUNT(*) as cnt FROM plan_cuentas WHERE parent_id = ? AND empresa_id = ?`,
      [params.grupoId, params.empresaId]
    )
    const cnt = Number((cntResult.rows?.item(0) as { cnt: number } | undefined)?.cnt ?? 0)
    const codigoSub = `${params.grupoCodigo}.${String(cnt + 1).padStart(2, '0')}`
    const subId = uuidv4()

    await tx.execute(
      `INSERT INTO plan_cuentas
         (id, empresa_id, codigo, nombre, tipo, naturaleza, parent_id, nivel, es_cuenta_detalle, is_active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'GASTO', 'DEUDORA', ?, ?, 1, 1, ?, ?, ?, NULL)`,
      [subId, params.empresaId, codigoSub, params.nombreSubcuenta.trim().toUpperCase(), params.grupoId, params.grupoNivel + 1, now, now, params.userId]
    )
  })
}

/**
 * Elimina una subcuenta GASTO si no tiene gastos registrados.
 */
export async function eliminarSubcuentaGasto(subcuentaId: string, empresaId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const r = await tx.execute(
      `SELECT COUNT(*) as cnt FROM gastos WHERE cuenta_id = ? AND empresa_id = ?`,
      [subcuentaId, empresaId]
    )
    const cnt = Number((r.rows?.item(0) as { cnt: number } | undefined)?.cnt ?? 0)
    if (cnt > 0) throw new Error('Esta subcuenta tiene gastos registrados y no puede eliminarse')
    await tx.execute(`DELETE FROM plan_cuentas WHERE id = ?`, [subcuentaId])
  })
}

/**
 * Elimina un grupo GASTO completo (grupo + todas sus subcuentas).
 * Solo se permite si ninguna subcuenta tiene gastos registrados.
 */
export async function eliminarGrupoGastoCompleto(grupoId: string, empresaId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    // Obtener todas las subcuentas del grupo
    const subsResult = await tx.execute(
      `SELECT id FROM plan_cuentas WHERE parent_id = ? AND empresa_id = ?`,
      [grupoId, empresaId]
    )
    const subIds: string[] = []
    if (subsResult.rows) {
      for (let i = 0; i < subsResult.rows.length; i++) {
        subIds.push((subsResult.rows.item(i) as { id: string }).id)
      }
    }

    // Verificar que ninguna subcuenta tenga gastos
    for (const subId of subIds) {
      const r = await tx.execute(
        `SELECT COUNT(*) as cnt FROM gastos WHERE cuenta_id = ? AND empresa_id = ?`,
        [subId, empresaId]
      )
      const cnt = Number((r.rows?.item(0) as { cnt: number } | undefined)?.cnt ?? 0)
      if (cnt > 0) {
        throw new Error('Este grupo tiene subcuentas con gastos registrados y no puede eliminarse')
      }
    }

    // Eliminar subcuentas y luego el grupo
    for (const subId of subIds) {
      await tx.execute(`DELETE FROM plan_cuentas WHERE id = ?`, [subId])
    }
    await tx.execute(`DELETE FROM plan_cuentas WHERE id = ?`, [grupoId])
  })
}
