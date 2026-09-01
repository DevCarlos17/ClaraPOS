import { useState, useCallback, useMemo, useEffect } from 'react'
import { Calculator, ArrowsClockwise, CheckCircle, Plus, PencilSimple, Trash, Check, X } from '@phosphor-icons/react'
import { useQuery } from '@powersync/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  usePagosPorMetodo,
  useSaldoEfectivoBimonetario,
  type CuadreFilters,
  type VerifiedEntry,
} from '../hooks/use-cuadre'
import { CuadreBilletesModal } from './cuadre-billetes-modal'
import { useLotesPos, agregarLote, actualizarLote, eliminarLote, type LotePos } from '@/features/caja/hooks/use-lotes-pos'
import { lotePosSchema } from '@/features/caja/schemas/lote-pos-schema'

interface ConteoFisicoProps {
  filters: CuadreFilters
  tasaDelDia: number
  verifiedAmountsByMetodoId: Record<string, VerifiedEntry>
  onTotalesChange?: (sistema: number, fisico: number, fisicoBs: number) => void
  /** Callback con el conteo fisico keyed por metodo_cobro_id (valor nativo) y total de metodos */
  onConteoFisicoChange?: (conteo: Record<string, number>, totalMetodos: number) => void
  /** Callback disparado al limpiar el conteo (para que el padre resetee otros componentes) */
  onLimpiar?: () => void
  /** Si true, los inputs se muestran en modo lectura con valores guardados en sesiones_caja_detalle */
  readOnly?: boolean
  /** Emite el total fisico en USD cada vez que cambia, para que el padre pueda pasarlo a otros componentes */
  onTotalChange?: (totalUsd: number) => void
}

export function CuadreConteoFisico({
  filters,
  tasaDelDia,
  verifiedAmountsByMetodoId,
  onTotalesChange,
  onConteoFisicoChange,
  onLimpiar,
  readOnly = false,
  onTotalChange,
}: ConteoFisicoProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  const { saldoEsperadoUsd, saldoEsperadoBs } = useSaldoEfectivoBimonetario(filters)
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Lotes POS: solo aplica cuando hay exactamente una sesion seleccionada y
  // esta activa (no readOnly) — es dato de trabajo pre-cierre editable.
  const sesionCajaId = !readOnly && filters.sesionCajaIds.length === 1
    ? filters.sesionCajaIds[0]
    : null
  const { lotesPorMetodo } = useLotesPos(sesionCajaId ?? '')

  // moneda_id por metodo tipo='PUNTO' (necesario para insertar en lotes_pos_cuadre)
  const { data: metodosPuntoData } = useQuery(
    sesionCajaId && empresaId
      ? `SELECT id, moneda_id FROM metodos_cobro WHERE empresa_id = ? AND tipo = 'PUNTO'`
      : '',
    sesionCajaId && empresaId ? [empresaId] : []
  )
  const monedaIdPorMetodo = useMemo(() => {
    const map: Record<string, string> = {}
    for (const row of (metodosPuntoData ?? []) as { id: string; moneda_id: string }[]) {
      map[row.id] = row.moneda_id
    }
    return map
  }, [metodosPuntoData])

  // keyed por m.nombre
  const [fisico, setFisico] = useState<Record<string, string>>({})
  const [billetesModal, setBilletesModal] = useState<{
    nombre: string
    moneda: 'USD' | 'BS'
  } | null>(null)

  // Clave de localStorage: combinacion de sesion IDs
  const storageKey = filters.sesionCajaIds.length > 0
    ? `cuadre-fisico-${filters.sesionCajaIds.sort().join(',')}`
    : null

  // Para sesiones cerradas: cargar total_fisico guardado en sesiones_caja_detalle
  const sesionId = filters.sesionCajaIds.length === 1 ? filters.sesionCajaIds[0] : null
  const { data: detalleData } = useQuery(
    readOnly && sesionId
      ? `SELECT scd.metodo_cobro_id, mc.nombre, scd.total_fisico
         FROM sesiones_caja_detalle scd
         JOIN metodos_cobro mc ON scd.metodo_cobro_id = mc.id
         WHERE scd.sesion_caja_id = ?`
      : '',
    readOnly && sesionId ? [sesionId] : []
  )

  // Modo lectura: pre-poblar desde sesiones_caja_detalle
  useEffect(() => {
    if (!readOnly || !detalleData || metodos.length === 0) return
    const saved: Record<string, string> = {}
    for (const row of detalleData as { nombre: string; total_fisico: string | null }[]) {
      if (row.total_fisico !== null) {
        saved[row.nombre] = row.total_fisico
      }
    }
    if (Object.keys(saved).length > 0) {
      setFisico(saved)
    }
  }, [readOnly, detalleData, metodos])

  // Persistencia en localStorage (solo cuando no es readOnly)
  useEffect(() => {
    if (readOnly || !storageKey) return
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        setFisico(JSON.parse(saved))
      } catch {
        // ignorar si el JSON es invalido
      }
    }
  // Solo al montar o cuando cambia la clave de sesion
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const setFisicoValue = useCallback((nombre: string, value: string) => {
    setFisico((prev) => {
      const next = { ...prev, [nombre]: value }
      if (!readOnly && storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(next))
      }
      return next
    })
  }, [readOnly, storageKey])

  const handleUseBilletes = useCallback(
    (total: number) => {
      if (billetesModal) {
        setFisicoValue(billetesModal.nombre, String(total))
      }
    },
    [billetesModal, setFisicoValue]
  )

  // Sincroniza `fisico` con la suma de lotes cargados para metodos tipo='PUNTO'
  // — reemplaza la entrada manual: la suma de lotes ES el fisico de ese metodo.
  useEffect(() => {
    if (!sesionCajaId) return
    for (const m of metodos) {
      if (m.tipo !== 'PUNTO') continue
      const lotes = lotesPorMetodo[m.metodo_cobro_id] ?? []
      const suma = lotes.reduce((acc, l) => acc + (parseFloat(l.monto) || 0), 0)
      const nextValue = lotes.length > 0 ? suma.toFixed(2) : ''
      // Defensa: solo escribir si el valor realmente cambia. Evita re-renders
      // no-op que, combinados con una referencia inestable de lotesPorMetodo,
      // producian un loop de renders al cerrar caja con Punto de Venta.
      if ((fisico[m.nombre] ?? '') !== nextValue) {
        setFisicoValue(m.nombre, nextValue)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodos, lotesPorMetodo, sesionCajaId])

  // Totales en USD para el resumen y callback del padre; fisicoBs en Bs. nativos
  const totals = useMemo(() => {
    // totalSistema viene del hook directamente, no de iterar los rows del UI.
    // Efectivo USD + Bs convertido (usando tasaDelDia o la tasa implícita en los pagos) + no-efectivo
    // Fallback de tasa: derivar de los datos de la transacción cuando tasaDelDia = 0
    const bsEfectivoMethod = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')
    const efectivaTasa = tasaDelDia > 0
      ? tasaDelDia
      : bsEfectivoMethod && bsEfectivoMethod.totalOriginal > 0 && bsEfectivoMethod.totalUsd > 0
        ? bsEfectivoMethod.totalOriginal / bsEfectivoMethod.totalUsd
        : 0
    const sistemaEfectivoUsd = saldoEsperadoUsd
      + (efectivaTasa > 0 ? saldoEsperadoBs / efectivaTasa : 0)
    const sistemaNoCash = metodos
      .filter((m) => m.tipo !== 'EFECTIVO')
      .reduce((acc, m) => acc + m.totalUsd, 0)
    const sistema = sistemaEfectivoUsd + sistemaNoCash

    let fisicoTotal = 0
    // Tracks EFECTIVO-only para comparación con arqueo teórico
    // (el arqueo teórico solo maneja efectivo — no incluir pago móvil, transferencias, etc.)
    let efectivoFisicoUsd = 0
    let efectivoFisicoBs = 0

    for (const m of metodos) {
      const esEfectivo = m.tipo === 'EFECTIVO'
      const mEfectivaTasa = tasaDelDia > 0
        ? tasaDelDia
        : m.totalOriginal > 0 && m.totalUsd > 0
        ? m.totalOriginal / m.totalUsd
        : 0
      const raw = parseFloat(fisico[m.nombre] ?? '') || 0
      const has = fisico[m.nombre] !== undefined && fisico[m.nombre] !== ''
      if (has) {
        if (m.moneda === 'BS') {
          const rawUsd = mEfectivaTasa > 0 ? raw / mEfectivaTasa : 0
          fisicoTotal += rawUsd
          if (esEfectivo) {
            efectivoFisicoUsd += rawUsd
            efectivoFisicoBs += raw
          }
        } else {
          fisicoTotal += raw
          if (esEfectivo) {
            efectivoFisicoUsd += raw
          }
        }
      }
    }
    return {
      totalSistema: Number(sistema.toFixed(2)),
      totalFisico: Number(fisicoTotal.toFixed(2)),
      // Tracks efectivo-only para el arqueo teórico
      efectivoFisicoUsd: Number(efectivoFisicoUsd.toFixed(2)),
      efectivoFisicoBs: Number(efectivoFisicoBs.toFixed(2)),
    }
  }, [metodos, fisico, tasaDelDia, saldoEsperadoUsd, saldoEsperadoBs])

  useEffect(() => {
    onTotalesChange?.(totals.totalSistema, totals.totalFisico, totals.efectivoFisicoBs)
  }, [totals.totalSistema, totals.totalFisico, totals.efectivoFisicoBs, onTotalesChange])

  useEffect(() => {
    // Emite el total EFECTIVO USD (no el global) para que el arqueo teórico
    // compare solo efectivo vs efectivo
    onTotalChange?.(totals.efectivoFisicoUsd)
  }, [totals.efectivoFisicoUsd, onTotalChange])

  // Conteo fisico keyed por metodo_cobro_id (valor nativo) para cerrarSesionCaja
  useEffect(() => {
    const conteo: Record<string, number> = {}
    for (const m of metodos) {
      const raw = parseFloat(fisico[m.nombre] ?? '') || 0
      const has = fisico[m.nombre] !== undefined && fisico[m.nombre] !== ''
      if (has) {
        conteo[m.metodo_cobro_id] = raw
      }
    }
    onConteoFisicoChange?.(conteo, metodos.length)
  }, [metodos, fisico, onConteoFisicoChange])

  const handleLimpiar = useCallback(() => {
    setFisico({})
    if (!readOnly && storageKey) {
      localStorage.removeItem(storageKey)
    }
    onLimpiar?.()
  }, [readOnly, storageKey, onLimpiar])

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-5">
        <h3 className="text-sm font-semibold mb-4">Conteo Fisico por Metodo</h3>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (metodos.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-5">
        <h3 className="text-sm font-semibold mb-4">Conteo Fisico por Metodo</h3>
        <p className="text-sm text-muted-foreground text-center py-6">Sin cobros registrados</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-1">Conteo Fisico por Metodo</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {readOnly
          ? 'Valores registrados al cerrar la sesion'
          : 'Ingrese el monto fisico contado para compararlo con el sistema'}
      </p>

      <div className="space-y-3">
        {metodos.map((m) => {
          const esEfectivo = m.tipo === 'EFECTIVO'
          const sistemaBs = esEfectivo && m.moneda === 'BS'
            ? saldoEsperadoBs
            : m.totalOriginal
          const fisicoRaw = parseFloat(fisico[m.nombre] ?? '') || 0
          // efectivaTasa: tasa del dia si existe, si no se estima desde los datos de la transaccion
          const efectivaTasa = tasaDelDia > 0
            ? tasaDelDia
            : m.totalOriginal > 0 && m.totalUsd > 0
            ? m.totalOriginal / m.totalUsd
            : 0
          // Para efectivo mostramos el saldo completo (apertura + cobros + movimientos).
          // Usa efectivaTasa (no tasaDelDia directamente) para ser consistente con fisicoUsd
          // cuando tasaDelDia = 0 y hay que usar la tasa de la transaccion como fallback.
          const sistemaUsd = esEfectivo
            ? (m.moneda === 'BS'
                ? (efectivaTasa > 0 ? saldoEsperadoBs / efectivaTasa : 0)
                : saldoEsperadoUsd)
            : m.totalUsd
          const fisicoUsd = m.moneda === 'BS'
            ? (efectivaTasa > 0 ? fisicoRaw / efectivaTasa : 0)
            : fisicoRaw
          const difUsd = fisicoUsd - sistemaUsd
          const tasaParaEquiv = tasaDelDia > 0 ? tasaDelDia : efectivaTasa
          const hasFisico = fisico[m.nombre] !== undefined && fisico[m.nombre] !== ''

          const verifiedEntry = verifiedAmountsByMetodoId[m.metodo_cobro_id]
          const hasVerified = !esEfectivo && verifiedEntry && verifiedEntry.native > 0.001

          const difColor = !hasFisico
            ? ''
            : difUsd > 0.001
            ? 'text-green-600'
            : difUsd < -0.001
            ? 'text-red-600'
            : 'text-green-600'

          return (
            <div key={m.nombre} className="rounded-lg border bg-background p-3 space-y-2">
              {/* Method name + system total */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{m.nombre}</span>
                  {!esEfectivo && (
                    <span className="ml-2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {m.tipo.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Sistema</p>
                  <p className="text-sm font-bold tabular-nums">
                    {m.moneda === 'BS' ? formatBs(sistemaBs) : formatUsd(sistemaUsd)}
                  </p>
                  {m.moneda === 'BS' && (
                    <p className="text-xs text-muted-foreground tabular-nums">{formatUsd(sistemaUsd)}</p>
                  )}
                </div>
              </div>

              {/* Lotes POS (tipo='PUNTO' con sesion activa) reemplaza el input unico:
                  el monto fisico del metodo pasa a ser la suma de sus lotes. */}
              {m.tipo === 'PUNTO' && sesionCajaId ? (
                <LotesPosMiniTable
                  metodoCobroId={m.metodo_cobro_id}
                  monedaId={monedaIdPorMetodo[m.metodo_cobro_id] ?? ''}
                  moneda={m.moneda === 'BS' ? 'BS' : 'USD'}
                  lotes={lotesPorMetodo[m.metodo_cobro_id] ?? []}
                  sesionCajaId={sesionCajaId}
                  empresaId={empresaId}
                  userId={user?.id ?? ''}
                />
              ) : (
                <>
                  {/* Physical count input */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {m.moneda === 'BS' ? 'Fisico (Bs.)' : 'Fisico (USD)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fisico[m.nombre] ?? ''}
                        onChange={(e) => !readOnly && setFisicoValue(m.nombre, e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        readOnly={readOnly}
                        placeholder={readOnly ? '—' : '0.00'}
                        className={`w-full rounded-md border border-input px-3 py-1.5 text-sm tabular-nums ${
                          readOnly ? 'bg-muted/40 text-muted-foreground cursor-default' : 'bg-white'
                        }`}
                      />
                    </div>

                    {/* Bill counter — only for EFECTIVO, not readOnly */}
                    {esEfectivo && !readOnly && (
                      <button
                        type="button"
                        title="Contar billetes"
                        onClick={() =>
                          setBilletesModal({ nombre: m.nombre, moneda: m.moneda === 'BS' ? 'BS' : 'USD' })
                        }
                        className="mt-5 p-2 rounded-md border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Calculator size={16} />
                      </button>
                    )}

                    {/* Use verified amount — for non-EFECTIVO, not readOnly */}
                    {hasVerified && !readOnly && (
                      <button
                        type="button"
                        onClick={() => setFisicoValue(m.nombre, verifiedEntry.native.toFixed(2))}
                        className="mt-5 inline-flex items-center gap-1 rounded-md border border-green-300 bg-green-50 hover:bg-green-100 px-2 py-1.5 text-xs font-medium text-green-700 transition-colors whitespace-nowrap"
                      >
                        <CheckCircle size={13} weight="fill" />
                        Usar {verifiedEntry.moneda === 'BS' ? formatBs(verifiedEntry.native) : formatUsd(verifiedEntry.native)}
                      </button>
                    )}
                  </div>

                  {/* Verified hint — solo mostrar si hay ajustes de supervisor */}
                  {hasVerified && !readOnly && verifiedEntry.overrideCount > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <CheckCircle size={11} weight="fill" />
                      {verifiedEntry.overrideCount} monto(s) ajustado(s) por supervisor
                    </p>
                  )}
                </>
              )}

              {/* Conversion + difference */}
              {hasFisico && (
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  {/* Equivalente en la otra moneda */}
                  {m.moneda === 'BS' && efectivaTasa > 0 ? (
                    <span className="text-muted-foreground">{formatUsd(fisicoUsd)} equiv.</span>
                  ) : m.moneda !== 'BS' && tasaParaEquiv > 0 ? (
                    <span className="text-muted-foreground">{formatBs(fisicoRaw * tasaParaEquiv)} equiv.</span>
                  ) : (
                    <span />
                  )}
                  {/* Diferencia: primaria en la moneda del método, secundaria en la otra */}
                  <div className={`text-right font-semibold tabular-nums ${difColor}`}>
                    {m.moneda === 'BS' ? (
                      <>
                        <div>{fisicoRaw - sistemaBs > 0.001 ? '+' : ''}{formatBs(fisicoRaw - sistemaBs)} dif.</div>
                        {efectivaTasa > 0 && (
                          <div className="font-normal text-[10px] opacity-75">
                            {difUsd > 0.001 ? '+' : ''}{formatUsd(difUsd)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>{difUsd > 0.001 ? '+' : ''}{formatUsd(difUsd)} dif.</div>
                        {tasaParaEquiv > 0 && (
                          <div className="font-normal text-[10px] opacity-75">
                            {difUsd > 0.001 ? '+' : ''}{formatBs(difUsd * tasaParaEquiv)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Summary row */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Saldo de caja (sistema)</span>
            <span className="font-bold tabular-nums">{formatUsd(totals.totalSistema)}</span>
          </div>
          {saldoEsperadoUsd > 0.001 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Efectivo USD esperado</span>
              <span className="font-mono tabular-nums text-blue-600">{formatUsd(saldoEsperadoUsd)}</span>
            </div>
          )}
          {saldoEsperadoBs > 0.001 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Efectivo Bs. esperado</span>
              <span className="font-mono tabular-nums text-blue-600">{formatBs(saldoEsperadoBs)}</span>
            </div>
          )}
          {Object.keys(fisico).length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="font-semibold">Total fisico ingresado</span>
                <span className="font-bold tabular-nums">{formatUsd(totals.totalFisico)}</span>
              </div>
              {(() => {
                const difTotal = totals.totalFisico - totals.totalSistema
                const difColor = difTotal > 0.001 ? 'text-green-600' : difTotal < -0.001 ? 'text-red-600' : 'text-green-600'
                const sign = difTotal > 0 ? '+' : ''
                const difTotalBs = tasaDelDia > 0 ? difTotal * tasaDelDia : null
                return (
                  <div className="flex items-center justify-between text-sm mt-1 pt-1 border-t">
                    <span className="font-semibold">Diferencia total</span>
                    <div className={`text-right font-bold tabular-nums ${difColor}`}>
                      <div>{sign}{formatUsd(difTotal)}</div>
                      {difTotalBs !== null && (
                        <div className="font-normal text-xs opacity-75">
                          {sign}{formatBs(difTotalBs)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleLimpiar}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowsClockwise size={12} />
              Limpiar conteo
            </button>
          )}
        </div>
      </div>

      {/* Billetes modal */}
      {billetesModal && (
        <CuadreBilletesModal
          isOpen={!!billetesModal}
          onClose={() => setBilletesModal(null)}
          moneda={billetesModal.moneda}
          titulo={billetesModal.nombre}
          onUseTotal={handleUseBilletes}
        />
      )}
    </div>
  )
}

// ─── Lotes POS: mini-tabla de captura por metodo tipo='PUNTO' ─────────────
// Reemplaza el input unico "Fisico" para métodos POS: el cajero carga cada
// lote del procesador (Banesco/Mercantil) con su numero y monto. La suma de
// lotes alimenta el conteo fisico del metodo (ver efecto de sincronizacion
// en CuadreConteoFisico). Persistencia en vivo — cada accion escribe de
// inmediato en `lotes_pos_cuadre` (no bufferizado hasta el cierre).

interface LotesPosMiniTableProps {
  metodoCobroId: string
  monedaId: string
  moneda: 'USD' | 'BS'
  lotes: LotePos[]
  sesionCajaId: string
  empresaId: string
  userId: string
}

function LotesPosMiniTable({
  metodoCobroId,
  monedaId,
  moneda,
  lotes,
  sesionCajaId,
  empresaId,
  userId,
}: LotesPosMiniTableProps) {
  const [nroLote, setNroLote] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  // Estados de envio separados por accion: un delete/edit en curso de OTRO
  // lote no debe bloquear el boton "+" de agregar (bug QA: shared boolean
  // dejaba el "+" deshabilitado mientras un eliminar seguia en vuelo).
  const [adding, setAdding] = useState(false)
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNroLote, setEditNroLote] = useState('')
  const [editMonto, setEditMonto] = useState('')

  const suma = lotes.reduce((acc, l) => acc + (parseFloat(l.monto) || 0), 0)
  const formatNativo = moneda === 'BS' ? formatBs : formatUsd

  async function handleAgregar() {
    setError('')
    const parsed = lotePosSchema.safeParse({
      metodo_cobro_id: metodoCobroId,
      nro_lote: nroLote.trim(),
      monto: parseFloat(monto),
      moneda_id: monedaId,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos invalidos')
      return
    }

    setAdding(true)
    try {
      await agregarLote({
        sesionCajaId,
        metodoCobroId,
        monedaId: parsed.data.moneda_id,
        nroLote: parsed.data.nro_lote,
        monto: parsed.data.monto,
        empresaId,
        userId,
      })
      setNroLote('')
      setMonto('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar el lote')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(lote: LotePos) {
    setEditingId(lote.id)
    setEditNroLote(lote.nro_lote)
    setEditMonto(lote.monto)
    setError('')
  }

  async function handleGuardarEdit(id: string) {
    const montoNum = parseFloat(editMonto)
    if (!editNroLote.trim() || !(montoNum > 0)) {
      setError('El lote y el monto deben ser validos')
      return
    }
    setSavingEditId(id)
    try {
      await actualizarLote(id, { nroLote: editNroLote.trim(), monto: montoNum })
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar el lote')
    } finally {
      setSavingEditId(null)
    }
  }

  async function handleEliminar(id: string) {
    setDeletingId(id)
    try {
      await eliminarLote(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar el lote')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground block">
        Lotes ({moneda === 'BS' ? 'Bs.' : 'USD'})
      </label>

      {lotes.length > 0 && (
        <div className="space-y-1">
          {lotes.map((lote) => (
            <div key={lote.id} className="flex items-center gap-1.5 text-xs">
              {editingId === lote.id ? (
                <>
                  <input
                    type="text"
                    value={editNroLote}
                    onChange={(e) => setEditNroLote(e.target.value)}
                    placeholder="Lote"
                    className="w-16 rounded-md border border-input px-1.5 py-1"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editMonto}
                    onChange={(e) => setEditMonto(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="flex-1 rounded-md border border-input px-1.5 py-1 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => handleGuardarEdit(lote.id)}
                    disabled={savingEditId === lote.id}
                    title="Guardar"
                    className="text-green-600 hover:text-green-700 px-1 disabled:opacity-40"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={savingEditId === lote.id}
                    title="Cancelar"
                    className="text-muted-foreground hover:text-foreground px-1 disabled:opacity-40"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="w-16 truncate font-medium">Lote {lote.nro_lote}</span>
                  <span className="flex-1 tabular-nums text-right">
                    {formatNativo(parseFloat(lote.monto))}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(lote)}
                    disabled={deletingId === lote.id}
                    title="Editar lote"
                    className="text-muted-foreground hover:text-foreground px-1 disabled:opacity-40"
                  >
                    <PencilSimple size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminar(lote.id)}
                    disabled={deletingId === lote.id}
                    title="Eliminar lote"
                    className="text-red-500 hover:text-red-600 px-1 disabled:opacity-40"
                  >
                    <Trash size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={nroLote}
          onChange={(e) => setNroLote(e.target.value)}
          placeholder="N° lote"
          className="w-16 rounded-md border border-input px-1.5 py-1.5 text-xs"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          className="flex-1 rounded-md border border-input px-1.5 py-1.5 text-xs tabular-nums"
        />
        <button
          type="button"
          onClick={handleAgregar}
          disabled={adding || !nroLote.trim() || !monto || !monedaId}
          title="Agregar lote"
          className="p-1.5 rounded-md border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>

      {!monedaId && (
        <p className="text-amber-600 text-xs">
          No se encontro la moneda de este metodo POS. Verifique la configuracion del metodo de cobro.
        </p>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {lotes.length > 0 && (
        <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t">
          <span>Total lotes</span>
          <span className="tabular-nums">{formatNativo(suma)}</span>
        </div>
      )}
    </div>
  )
}
