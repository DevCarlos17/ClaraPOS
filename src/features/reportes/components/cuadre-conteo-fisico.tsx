import { useState, useCallback } from 'react'
import { Calculator, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodo, type CuadreFilters } from '../hooks/use-cuadre'
import { CuadreBilletesModal } from './cuadre-billetes-modal'

interface ConteoFisicoProps {
  filters: CuadreFilters
  tasaDelDia: number
  verifiedAmountsByMetodoId: Record<string, number>
}

export function CuadreConteoFisico({ filters, tasaDelDia, verifiedAmountsByMetodoId }: ConteoFisicoProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  // fisico[metodoNombre] = string amount entered by user (in the method's own currency)
  const [fisico, setFisico] = useState<Record<string, string>>({})
  const [billetesModal, setBilletesModal] = useState<{
    nombre: string
    moneda: 'USD' | 'BS'
  } | null>(null)

  const setFisicoValue = useCallback((nombre: string, value: string) => {
    setFisico((prev) => ({ ...prev, [nombre]: value }))
  }, [])

  const handleUseBilletes = useCallback((total: number) => {
    if (billetesModal) {
      setFisicoValue(billetesModal.nombre, String(total))
    }
  }, [billetesModal, setFisicoValue])

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

  // Totals for summary row
  let totalSistema = 0
  let totalFisico = 0

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-1">Conteo Fisico por Metodo</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Ingrese el monto fisico contado para compararlo con el sistema
      </p>

      <div className="space-y-3">
        {metodos.map((m) => {
          const esEfectivo = m.tipo === 'EFECTIVO'
          const sistemaUsd = m.totalUsd
          const sistemaBs = m.totalOriginal
          const fisicoRaw = parseFloat(fisico[m.nombre] ?? '') || 0
          // For USD methods: fisicoRaw is in USD
          // For BS methods: fisicoRaw is in BS, convert to USD
          const fisicoUsd = m.moneda === 'BS'
            ? (tasaDelDia > 0 ? fisicoRaw / tasaDelDia : 0)
            : fisicoRaw
          const difUsd = fisicoUsd - sistemaUsd
          const hasFisico = fisico[m.nombre] !== undefined && fisico[m.nombre] !== ''

          // Verified amount for non-EFECTIVO methods
          const verifiedUsd = verifiedAmountsByMetodoId[m.metodo_cobro_id] ?? 0

          totalSistema += sistemaUsd
          if (hasFisico) totalFisico += fisicoUsd

          const difColor = !hasFisico ? '' : difUsd > 0.001 ? 'text-green-600' : difUsd < -0.001 ? 'text-red-600' : 'text-green-600'

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
                    onChange={(e) => setFisicoValue(m.nombre, e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm tabular-nums"
                  />
                </div>

                {/* Bill counter button — only for EFECTIVO */}
                {esEfectivo && (
                  <button
                    type="button"
                    title="Contar billetes"
                    onClick={() => setBilletesModal({ nombre: m.nombre, moneda: m.moneda === 'BS' ? 'BS' : 'USD' })}
                    className="mt-5 p-2 rounded-md border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Calculator size={16} />
                  </button>
                )}

                {/* Use verified amount button — for non-EFECTIVO methods */}
                {!esEfectivo && verifiedUsd > 0.001 && (
                  <button
                    type="button"
                    title="Usar total verificado en Detalle de pagos"
                    onClick={() => setFisicoValue(m.nombre, String(verifiedUsd.toFixed(2)))}
                    className="mt-5 p-2 rounded-md border border-green-300 hover:bg-green-50 transition-colors text-green-700"
                  >
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>

              {/* Verified hint for non-EFECTIVO */}
              {!esEfectivo && verifiedUsd > 0.001 && (
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle size={11} weight="fill" />
                  {formatUsd(verifiedUsd)} verificado(s) en detalle de pagos
                </p>
              )}

              {/* Conversion + difference */}
              {hasFisico && (
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  {m.moneda === 'BS' && tasaDelDia > 0 ? (
                    <span className="text-muted-foreground">{formatUsd(fisicoUsd)} equiv.</span>
                  ) : m.moneda !== 'BS' && tasaDelDia > 0 ? (
                    <span className="text-muted-foreground">{formatBs(fisicoRaw * tasaDelDia)} equiv.</span>
                  ) : (
                    <span />
                  )}
                  <span className={`font-semibold tabular-nums ${difColor}`}>
                    {difUsd > 0.001 ? '+' : ''}{formatUsd(difUsd)} dif.
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
            <span className="font-bold tabular-nums">{formatUsd(totalSistema)}</span>
          </div>
          {Object.keys(fisico).length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="font-semibold">Total fisico ingresado</span>
                <span className="font-bold tabular-nums">{formatUsd(totalFisico)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1 pt-1 border-t">
                <span className="font-semibold">Diferencia total</span>
                <span className={`font-bold tabular-nums ${
                  totalFisico - totalSistema > 0.001 ? 'text-green-600' :
                  totalFisico - totalSistema < -0.001 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {totalFisico - totalSistema > 0 ? '+' : ''}{formatUsd(totalFisico - totalSistema)}
                </span>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setFisico({})}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowsClockwise size={12} />
            Limpiar conteo
          </button>
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
