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
  /** Subgrupos hijos DIRECTOS (recursivo — cada uno ya trae sus propios subgrupos/hojas/subcuentas). */
  subgrupos: GrupoConSubcuentas[]
  /** Cuentas de detalle (hojas) hijas DIRECTAS de este nodo (sin incluir las de subgrupos anidados). */
  hojas: CuentaContable[]
  /** TODAS las hojas descendientes del subarbol, a cualquier profundidad, aplanadas. */
  subcuentas: CuentaContable[]
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Ids de `plan_cuentas` referenciados por `cuentas_config` (cuentas/grupos
 * vinculados al sistema). Estas cuentas no pueden desactivarse (ver
 * `PlanCuentasList`) ni eliminarse (ver `CuentaGastoModal`) porque otras
 * partes del sistema dependen de su existencia (ej. los grupos resolver
 * `GRUPO_COMISIONES_PASARELA`/`GRUPO_COMISIONES_BANCARIAS` de PR-2b).
 * Extraido como hook propio para que ambos consumidores reusen la MISMA
 * query/logica en vez de duplicarla.
 */
export function useSistemaCuentaIds(): Set<string> {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: configData } = useQuery(
    'SELECT cuenta_contable_id FROM cuentas_config WHERE empresa_id = ?',
    [empresaId]
  )

  return useMemo(() => {
    const set = new Set<string>()
    for (const row of (configData ?? []) as { cuenta_contable_id: string }[]) {
      if (row.cuenta_contable_id) set.add(row.cuenta_contable_id)
    }
    return set
  }, [configData])
}

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
  const sistemaCuentaIds = useSistemaCuentaIds()

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
 * Grupos de tipo GASTO con su arbol de subgrupos y subcuentas de movimiento.
 * Usado en el modal de gestion de cuentas de gasto y en los selectores de
 * registro manual de gasto (`gastos-dashboard.tsx`, `gasto-list.tsx`,
 * `cuenta-gasto-modal.tsx`).
 *
 * Construye el arbol de forma RECURSIVA y por profundidad agnostica (reusa
 * el patron childrenMap + recorrido en profundidad de `plan-cuentas-list.tsx`):
 * cada grupo devuelto conserva sus `subgrupos` hijos DIRECTOS (a su vez con
 * su propio arbol completo), sus `hojas` hijas DIRECTAS, y `subcuentas` con
 * TODAS las hojas descendientes del subarbol aplanadas (a cualquier
 * profundidad) — este ultimo campo es el que consumen los calculos de
 * totales/filtros existentes sin necesitar cambios.
 *
 * Un grupo que organiza puramente subgrupos (sin hojas en NINGUN nivel de su
 * subarbol, ej. `6.1.25 GASTOS DE VENTA` o `6.2.06 GASTOS FINANCIEROS` de la
 * migracion 0081 si quedaran sin hojas) se EXCLUYE del resultado — evita que
 * aparezcan como entradas fantasma vacias en los selectores (ver tasks.md
 * 3b.2.7). Un grupo que SI tiene hojas en algun nivel de su subarbol (directo
 * o anidado, ej. `6.1.25.01`/`6.2.06.01`) se muestra, ANIDADO dentro de su
 * padre — nunca como hermano suelto del nivel raiz.
 *
 * `is_active = 1` en la query filtra tanto grupos como hojas desactivados
 * (ej. el subgrupo plano `6.2.05` y sus leaves `6.2.05.NN`, superados y
 * desactivados por la migracion 0081) para que no aparezcan como opciones
 * seleccionables en los 3 selectores de registro manual de gasto.
 */
export function useGruposGastoConSubcuentas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM plan_cuentas
     WHERE empresa_id = ? AND tipo = 'GASTO' AND is_active = 1
     ORDER BY codigo ASC`,
    [empresaId]
  )

  const grupos = useMemo(() => {
    const all = (data ?? []) as CuentaContable[]

    // Mapa de hijos: parent_id -> hijos directos (grupos y hojas mezclados)
    const childrenMap = new Map<string | null, CuentaContable[]>()
    for (const c of all) {
      const key = c.parent_id ?? null
      const arr = childrenMap.get(key)
      if (arr) arr.push(c)
      else childrenMap.set(key, [c])
    }

    // Guard de ciclos: `cuenta-form.tsx` permite reasignar el `parent_id` de
    // cualquier grupo a cualquier otro (incluido uno de sus propios
    // descendientes) sin validacion. Un ciclo asi termina siendo inalcanzable
    // desde la raiz en el 99% de los casos (parent_id es un puntero unico
    // por fila), pero se agrega este guard como defensa adicional: si un
    // nodo ya fue visitado en la rama actual, se corta la recursion en vez
    // de arriesgar un stack overflow.
    const visitados = new Set<string>()

    // Construye recursivamente el nodo de un grupo. Devuelve null si el
    // subarbol completo del grupo no tiene NINGUNA hoja (grupo fantasma
    // vacio, ej. un subgrupo organizador sin cuentas de detalle aun) — se
    // descarta en cualquier profundidad, no solo en la raiz.
    function buildGrupo(node: CuentaContable): GrupoConSubcuentas | null {
      if (visitados.has(node.id)) return null
      visitados.add(node.id)

      const hijos = childrenMap.get(node.id) ?? []
      const hojas: CuentaContable[] = []
      const subgrupos: GrupoConSubcuentas[] = []

      for (const hijo of hijos) {
        if (hijo.es_cuenta_detalle === 1) {
          hojas.push(hijo)
        } else {
          const sub = buildGrupo(hijo)
          if (sub) subgrupos.push(sub)
        }
      }

      const subcuentas = [...hojas, ...subgrupos.flatMap((s) => s.subcuentas)]
      if (subcuentas.length === 0) return null

      return { ...node, subgrupos, hojas, subcuentas }
    }

    const raices = childrenMap.get(null) ?? []
    return raices
      .filter((c) => c.es_cuenta_detalle === 0)
      .map(buildGrupo)
      .filter((g): g is GrupoConSubcuentas => g !== null)
  }, [data])

  return { grupos, isLoading }
}

/**
 * Busca un grupo (raiz o anidado a cualquier profundidad) por id dentro del
 * arbol devuelto por `useGruposGastoConSubcuentas`. Necesario porque los
 * selectores/filtros ("Por grupo") pueden apuntar a un subgrupo anidado
 * (ej. `6.1.25.01 COMISIONES DE PASARELAS DE PAGO`), no solo a un grupo raiz.
 *
 * `visitados` es un guard defensivo contra ciclos (ver nota en
 * `useGruposGastoConSubcuentas`) — se completa automaticamente en la
 * llamada externa, no hace falta pasarlo.
 */
export function findGrupoGastoById(
  grupos: GrupoConSubcuentas[],
  id: string,
  visitados: Set<string> = new Set()
): GrupoConSubcuentas | undefined {
  for (const g of grupos) {
    if (visitados.has(g.id)) continue
    visitados.add(g.id)
    if (g.id === id) return g
    const found = findGrupoGastoById(g.subgrupos, id, visitados)
    if (found) return found
  }
  return undefined
}

/**
 * Aplana el arbol de grupos en una lista con su profundidad (0 = raiz),
 * en recorrido pre-orden (el grupo antes que sus subgrupos). Util para
 * selects/dropdowns que deben mostrar la jerarquia completa con sangria en
 * vez de solo los grupos raiz.
 *
 * `visitados` es un guard defensivo contra ciclos — se completa
 * automaticamente en la llamada externa, no hace falta pasarlo.
 */
export function flattenGruposGasto(
  grupos: GrupoConSubcuentas[],
  depth = 0,
  visitados: Set<string> = new Set()
): { grupo: GrupoConSubcuentas; depth: number }[] {
  const result: { grupo: GrupoConSubcuentas; depth: number }[] = []
  for (const g of grupos) {
    if (visitados.has(g.id)) continue
    visitados.add(g.id)
    result.push({ grupo: g, depth })
    result.push(...flattenGruposGasto(g.subgrupos, depth + 1, visitados))
  }
  return result
}

/**
 * Recolecta los ids de TODOS los grupos del arbol (raiz + anidados a
 * cualquier profundidad). Util para "expandir todo" / "colapsar todo" en
 * los 3 consumidores, que antes solo consideraban el nivel raiz.
 *
 * `visitados` es un guard defensivo contra ciclos — se completa
 * automaticamente en la llamada externa, no hace falta pasarlo.
 */
export function collectGrupoGastoIds(
  grupos: GrupoConSubcuentas[],
  visitados: Set<string> = new Set()
): string[] {
  const ids: string[] = []
  for (const g of grupos) {
    if (visitados.has(g.id)) continue
    visitados.add(g.id)
    ids.push(g.id)
    ids.push(...collectGrupoGastoIds(g.subgrupos, visitados))
  }
  return ids
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
 * Elimina un grupo GASTO completo (grupo + sus subcuentas DIRECTAS).
 * Solo se permite si ninguna subcuenta tiene gastos registrados.
 *
 * IMPORTANTE: esta funcion NO borra recursivamente subgrupos anidados (solo
 * filas con `parent_id = grupoId`). `CuentaGastoModal` protege esto en la UI
 * — el boton de eliminar se deshabilita si el grupo tiene `subgrupos` (ver
 * `GrupoConSubcuentas.subgrupos`) o si es una cuenta de sistema (ver
 * `useSistemaCuentaIds`), para no dejar hojas huerfanas ni violar los
 * `ON DELETE RESTRICT` de Postgres (`plan_cuentas.parent_id`,
 * `cuentas_config.cuenta_contable_id`) al sincronizar. No llamar a esta
 * funcion sobre un grupo con subgrupos sin repetir esa validacion.
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
