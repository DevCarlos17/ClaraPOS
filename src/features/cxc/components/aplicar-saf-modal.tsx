import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useFacturasPendientes, aplicarSaldoFavor, type ClienteConDeuda } from '../hooks/use-cxc'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface AplicarSafModalProps {
  isOpen: boolean
  onClose: () => void
  cliente: ClienteConDeuda
  onSuccess: () => void
}

type Modo = 'fifo' | 'manual'

export function AplicarSafModal({ isOpen, onClose, cliente, onSuccess }: AplicarSafModalProps) {
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { facturas, isLoading } = useFacturasPendientes(isOpen ? cliente.id : null)

  const [modo, setModo] = useState<Modo>('fifo')
  const [montoManual, setMontoManual] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const creditoDisponible = Math.abs(parseFloat(cliente.saldo_actual))

  // Calculo FIFO: distribuye el crédito entre facturas ordenadas por fecha (ya vienen ASC)
  const fifoItems = useMemo(() => {
    let restante = creditoDisponible
    const items: Array<{
      ventaId: string
      nroFactura: string
      saldoPend: number
      aplicar: number
    }> = []
    for (const f of facturas) {
      if (restante <= 0.001) break
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Math.min(saldo, restante)
      if (aplicar > 0.001) {
        items.push({ ventaId: f.id, nroFactura: f.nro_factura, saldoPend: saldo, aplicar })
        restante = Number((restante - aplicar).toFixed(2))
      }
    }
    return items
  }, [facturas, creditoDisponible])

  const totalFifo = useMemo(
    () => fifoItems.reduce((s, i) => Number((s + i.aplicar).toFixed(2)), 0),
    [fifoItems]
  )

  // Total manual asignado
  const totalManual = useMemo(() => {
    return Object.values(montoManual).reduce((sum, v) => {
      const n = parseFloat(v) || 0
      return Number((sum + n).toFixed(2))
    }, 0)
  }, [montoManual])

  const excedeCreditoManual = totalManual > creditoDisponible + 0.001

  const canSubmit =
    !submitting &&
    (modo === 'fifo' ? fifoItems.length > 0 : totalManual > 0.001 && !excedeCreditoManual)

  const totalAMostrar = modo === 'fifo' ? totalFifo : totalManual

  function handleModeChange(m: Modo) {
    setModo(m)
    setMontoManual({})
  }

  const handleSubmit = async () => {
    if (!canSubmit || !user) return

    setSubmitting(true)
    try {
      let facturasAplicar: Array<{
        ventaId: string
        nroFactura: string
        montoAplicarUsd: number
      }>

      if (modo === 'fifo') {
        facturasAplicar = fifoItems.map((item) => ({
          ventaId: item.ventaId,
          nroFactura: item.nroFactura,
          montoAplicarUsd: item.aplicar,
        }))
      } else {
        facturasAplicar = facturas
          .filter((f) => (parseFloat(montoManual[f.id] || '0') || 0) > 0.001)
          .map((f) => ({
            ventaId: f.id,
            nroFactura: f.nro_factura,
            montoAplicarUsd: parseFloat(montoManual[f.id] || '0') || 0,
          }))
      }

      const totalAplicado = Number(
        facturasAplicar.reduce((s, f) => s + f.montoAplicarUsd, 0).toFixed(2)
      )

      await aplicarSaldoFavor({
        clienteId: cliente.id,
        empresaId: user.empresa_id!,
        cajeroId: user.id,
        tasa: tasaValor,
        facturas: facturasAplicar,
        totalAplicadoUsd: totalAplicado,
      })

      toast.success(
        `Saldo a favor aplicado: ${formatUsd(totalAplicado)} en ${facturasAplicar.length} factura(s)`
      )
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al aplicar saldo a favor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar Saldo a Favor</DialogTitle>
          <p className="text-sm text-muted-foreground">{cliente.nombre}</p>
        </DialogHeader>

        {/* Crédito disponible */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-green-700">Saldo a Favor disponible</span>
            <span className="font-bold text-green-700 tabular-nums">
              +{formatUsd(creditoDisponible)}
            </span>
          </div>
          {tasaValor > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Equivalente Bs</span>
              <span className="text-muted-foreground tabular-nums">
                {formatBs(usdToBs(creditoDisponible, tasaValor))}
              </span>
            </div>
          )}
        </div>

        {/* Toggle de modo */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('fifo')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              modo === 'fifo'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground hover:bg-muted'
            }`}
          >
            FIFO automatico
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('manual')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              modo === 'manual'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground hover:bg-muted'
            }`}
          >
            Seleccion manual
          </button>
        </div>

        {/* Contenido según modo */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : facturas.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No hay facturas pendientes para aplicar el saldo
          </div>
        ) : modo === 'fifo' ? (
          /* ─── Vista FIFO ─── */
          fifoItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hay facturas pendientes con saldo mayor a cero
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Factura
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pendiente
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      A aplicar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fifoItems.map((item) => (
                    <tr key={item.ventaId} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        #{item.nroFactura}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatUsd(item.saldoPend)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-600">
                        {formatUsd(item.aplicar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Total a aplicar
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-green-600">
                      {formatUsd(totalFifo)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : (
          /* ─── Vista Manual ─── */
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Factura
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pendiente
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Aplicar (USD)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => {
                    const saldo = parseFloat(f.saldo_pend_usd)
                    const montoVal = parseFloat(montoManual[f.id] || '0') || 0
                    const excedeFactura = montoVal > saldo + 0.001
                    return (
                      <tr key={f.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">
                          #{f.nro_factura}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatUsd(saldo)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-0.5">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={saldo}
                              value={montoManual[f.id] ?? ''}
                              onChange={(e) =>
                                setMontoManual((prev) => ({ ...prev, [f.id]: e.target.value }))
                              }
                              placeholder="0.00"
                              className={`h-7 w-24 text-right text-xs ${
                                excedeFactura ? 'border-destructive' : ''
                              }`}
                            />
                            {excedeFactura && (
                              <span className="text-[10px] text-destructive">Excede saldo</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumen total asignado vs disponible */}
            <div
              className={`rounded-lg border p-3 ${
                excedeCreditoManual ? 'border-red-200 bg-red-50' : 'bg-muted/50'
              }`}
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total asignado</span>
                <span
                  className={`font-bold tabular-nums ${
                    excedeCreditoManual ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  {formatUsd(totalManual)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Credito disponible</span>
                <span className="font-medium tabular-nums text-green-600">
                  {formatUsd(creditoDisponible)}
                </span>
              </div>
              {excedeCreditoManual && (
                <p className="mt-2 text-xs text-destructive">
                  El total asignado supera el saldo a favor disponible
                </p>
              )}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="border-green-600 bg-green-600 text-white hover:bg-green-700"
          >
            {submitting
              ? 'Aplicando...'
              : `Aplicar ${formatUsd(totalAMostrar)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
