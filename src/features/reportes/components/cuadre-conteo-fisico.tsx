import { useState, useCallback, useMemo, useEffect } from 'react'
import { Calculator, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react'
import { useQuery } from '@powersync/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodo, type CuadreFilters, type VerifiedEntry } from '../hooks/use-cuadre'
import { CuadreBilletesModal } from './cuadre-billetes-modal'

interface ConteoFisicoProps {
  filters: CuadreFilters
  tasaDelDia: number
  verifiedAmountsByMetodoId: Record<string, VerifiedEntry>
  onTotalesChange?: (sistema: number, fisico: number) => void
  /** Callback con el conteo fisico keyed por metodo_cobro_id (valor nativo) y total de metodos */
  onConteoFisicoChange?: (conteo: Record<string, number>, totalMetodos: number) => void
  /** Callback disparado al limpiar el conteo (para que el padre resetee otros componentes) */
  onLimpiar?: () => void
  /** Si true, los inputs se muestran en modo lectura con valores guardados en sesiones_caja_detalle */
  readOnly?: boolean
}

export function CuadreConteoFisico({
  filters,
  tasaDelDia,
  verifiedAmountsByMetodoId,
  onTotalesChange,
  onConteoFisicoChange,
  onLimpiar,
  readOnly = false,
}: ConteoFisicoProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
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

  // Totales en USD para el resumen y callback del padre
  const totals = useMemo(() => {
    let sistema = 0
    let fisicoTotal = 0
    for (const m of metodos) {
      sistema += m.totalUsd
      const raw = parseFloat(fisico[m.nombre] ?? '') || 0
      const has = fisico[m.nombre] !== undefined && fisico[m.nombre] !== ''
      if (has) {
        if (m.moneda === 'BS') {
          // Tasa efectiva: derivar de los pagos si tasaDelDia no esta disponible
          const efectivaTasa = tasaDelDia > 0
            ? tasaDelDia
            : m.totalOriginal > 0 && m.totalUsd > 0
            ? m.totalOriginal / m.totalUsd
            : 0
          fisicoTotal += efectivaTasa > 0 ? raw / efectivaTasa : 0
        } else {
          fisicoTotal += raw
        }
      }
    }
    return { totalSistema: Number(sistema.toFixed(2)), totalFisico: Number(fisicoTotal.toFixed(2)) }
  }, [metodos, fisico, tasaDelDia])

  useEffect(() => {
    onTotalesChange?.(totals.totalSistema, totals.totalFisico)
  }, [totals, onTotalesChange])

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
          const sistemaUsd = m.totalUsd
          const sistemaBs = m.totalOriginal
          const fisicoRaw = parseFloat(fisico[m.nombre] ?? '') || 0
          const efectivaTasa = tasaDelDia > 0
            ? tasaDelDia
            : m.totalOriginal > 0 && m.totalUsd > 0
            ? m.totalOriginal / m.totalUsd
            : 0
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

              {/* Conversion + difference */}
              {hasFisico && (
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  {m.moneda === 'BS' && efectivaTasa > 0 ? (
                    <span className="text-muted-foreground">{formatUsd(fisicoUsd)} equiv.</span>
                  ) : m.moneda !== 'BS' && tasaParaEquiv > 0 ? (
                    <span className="text-muted-foreground">{formatBs(fisicoRaw * tasaParaEquiv)} equiv.</span>
                  ) : (
                    <span />
                  )}
                  <span className={`font-semibold tabular-nums ${difColor}`}>
                    {difUsd > 0.001 ? '+' : ''}
                    {formatUsd(difUsd)} dif.
                  </span>
                </div>
              )}
            </div>
          )
        })}

        {/* Summary row */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Total cobrado (sistema)</span>
            <span className="font-bold tabular-nums">{formatUsd(totals.totalSistema)}</span>
          </div>
          {Object.keys(fisico).length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="font-semibold">Total fisico ingresado</span>
                <span className="font-bold tabular-nums">{formatUsd(totals.totalFisico)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1 pt-1 border-t">
                <span className="font-semibold">Diferencia total</span>
                <span
                  className={`font-bold tabular-nums ${
                    totals.totalFisico - totals.totalSistema > 0.001
                      ? 'text-green-600'
                      : totals.totalFisico - totals.totalSistema < -0.001
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {totals.totalFisico - totals.totalSistema > 0 ? '+' : ''}
                  {formatUsd(totals.totalFisico - totals.totalSistema)}
                </span>
              </div>
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
