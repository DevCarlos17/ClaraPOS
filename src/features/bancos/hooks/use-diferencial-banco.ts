import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosDiferencialBanco } from '@/features/contabilidad/lib/generar-asientos'

// ─── Interfaz ────────────────────────────────────────────────

export interface DiferencialBanco {
  banco_id: string
  nombre_banco: string
  nro_cuenta: string | null
  cuenta_contable_id: string | null
  moneda_id: string
  moneda_iso: string
  saldo_foreign: number      // saldo en moneda propia (ej. USD)
  tasa: number               // tasa actual de esa moneda
  saldo_bs_real: number      // saldo_foreign * tasa
  saldo_bs_libro: number     // suma de entradas en libro_contable
  diferencial_bs: number     // saldo_bs_real - saldo_bs_libro
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Calcula el diferencial cambiario de todos los bancos en moneda extranjera (no VES).
 * Usa cuatro queries separadas para mantener reactividad independiente por tabla.
 */
export function useDiferencialBancos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // 1. Bancos activos con cuenta contable vinculada
  const { data: bancosRaw, isLoading: bancosLoading } = useQuery(
    `SELECT id, nombre_banco, nro_cuenta, moneda_id, saldo_actual, cuenta_contable_id
     FROM bancos_empresa
     WHERE empresa_id = ? AND is_active = 1
     ORDER BY nombre_banco ASC`,
    [empresaId]
  )

  // 2. Catalogo de monedas (global, sin empresa_id)
  const { data: monedasRaw, isLoading: monedasLoading } = useQuery(
    'SELECT id, codigo_iso FROM monedas',
    []
  )

  // 3. Valor en libro por banco (suma de montos no anulados)
  const { data: libroRaw, isLoading: libroLoading } = useQuery(
    `SELECT banco_empresa_id, SUM(CAST(monto AS REAL)) as suma_bs
     FROM libro_contable
     WHERE empresa_id = ? AND banco_empresa_id IS NOT NULL AND estado != 'ANULADO'
     GROUP BY banco_empresa_id`,
    [empresaId]
  )

  // 4. Ultima tasa por moneda (correlated subquery sobre SQLite local — no es sync rule)
  const { data: tasasRaw, isLoading: tasasLoading } = useQuery(
    `SELECT moneda_id, CAST(valor AS REAL) as valor
     FROM tasas_cambio
     WHERE empresa_id = ?
       AND created_at = (
         SELECT MAX(t2.created_at) FROM tasas_cambio t2
         WHERE t2.empresa_id = tasas_cambio.empresa_id
           AND t2.moneda_id = tasas_cambio.moneda_id
       )`,
    [empresaId]
  )

  const isLoading = bancosLoading || monedasLoading || libroLoading || tasasLoading

  // ── Merge en JS ───────────────────────────────────────────

  const bancos = (bancosRaw ?? []) as Array<{
    id: string; nombre_banco: string; nro_cuenta: string | null
    moneda_id: string; saldo_actual: string; cuenta_contable_id: string | null
  }>
  const monedas = (monedasRaw ?? []) as Array<{ id: string; codigo_iso: string }>
  const libro = (libroRaw ?? []) as Array<{ banco_empresa_id: string; suma_bs: number | null }>
  const tasas = (tasasRaw ?? []) as Array<{ moneda_id: string; valor: number }>

  const monedasMap = new Map(monedas.map((m) => [m.id, m.codigo_iso]))
  const tasasMap = new Map(tasas.map((t) => [t.moneda_id, t.valor]))
  const libroMap = new Map(libro.map((l) => [l.banco_empresa_id, l.suma_bs ?? 0]))

  const diferenciales: DiferencialBanco[] = bancos
    .map((b) => {
      const iso = monedasMap.get(b.moneda_id) ?? ''
      const tasa = tasasMap.get(b.moneda_id) ?? 0
      const saldoForeign = parseFloat(b.saldo_actual) || 0
      const saldoBsReal = Number((saldoForeign * tasa).toFixed(2))
      const saldoBsLibro = Number((libroMap.get(b.id) ?? 0).toFixed(2))
      const diferencial = Number((saldoBsReal - saldoBsLibro).toFixed(2))

      return {
        banco_id: b.id,
        nombre_banco: b.nombre_banco,
        nro_cuenta: b.nro_cuenta,
        cuenta_contable_id: b.cuenta_contable_id,
        moneda_id: b.moneda_id,
        moneda_iso: iso,
        saldo_foreign: saldoForeign,
        tasa,
        saldo_bs_real: saldoBsReal,
        saldo_bs_libro: saldoBsLibro,
        diferencial_bs: diferencial,
      } satisfies DiferencialBanco
    })
    .filter((b) => b.moneda_iso !== '' && b.moneda_iso !== 'VES') // Solo moneda extranjera

  return { diferenciales, isLoading }
}

// ─── Funcion de escritura ─────────────────────────────────────

/**
 * Registra el asiento de ajuste por diferencial cambiario para un banco en moneda extranjera.
 */
export async function aplicarDiferencialBanco(params: {
  empresaId: string
  bancoId: string
  cuentaBancoId: string
  diferencialBs: number
  tasa: number
  monedaIso: string
  nombreBanco: string
  usuarioId: string
}): Promise<void> {
  const { empresaId, bancoId, cuentaBancoId, diferencialBs, tasa, monedaIso, nombreBanco, usuarioId } = params

  if (Math.abs(diferencialBs) < 0.01) throw new Error('El diferencial es insignificante')

  await db.writeTransaction(async (tx) => {
    const cuentas = await cargarMapaCuentas(tx, empresaId)

    await generarAsientosDiferencialBanco(tx, {
      empresaId,
      bancoEmpresaId: bancoId,
      cuentaBancoId,
      diferencialBs,
      cuentas,
      usuarioId,
      descripcion: `Dif. cambiario ${nombreBanco} (${monedaIso} @ ${tasa.toFixed(2)})`,
    })
  })
}
