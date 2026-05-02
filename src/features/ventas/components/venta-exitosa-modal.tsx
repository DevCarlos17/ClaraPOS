import { useEffect } from 'react'
import { SealCheck } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import type { PagoEntryForm } from '../schemas/venta-schema'
import type { CargoEspecial } from '../hooks/use-ventas'

export interface VentaExitosaData {
  nroFactura: string
  clienteNombre: string
  totalUsd: number
  totalBs: number
  tipo: 'CONTADO' | 'CREDITO'
  pagos: PagoEntryForm[]
  tasa: number
  cargosEspeciales?: CargoEspecial[]
}

interface VentaExitosaModalProps {
  isOpen: boolean
  data: VentaExitosaData | null
  onClose: () => void
}

export function VentaExitosaModal({ isOpen, data, onClose }: VentaExitosaModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen || !data) return null

  const totalAbonadoUsd = data.pagos.reduce((sum, p) => {
    const montoUsd = p.moneda === 'BS' ? Number((p.monto / data.tasa).toFixed(2)) : p.monto
    return sum + montoUsd
  }, 0)
  const saldoPendUsd = Math.max(0, Number((data.totalUsd - totalAbonadoUsd).toFixed(2)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-slate-50 shadow-2xl animate-in zoom-in-95 fade-in duration-200">

        <div className="px-6 pt-8 pb-7 space-y-5">

          {/* Icono + titulo */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-green-100" />
              <SealCheck
                className="relative text-green-500 drop-shadow-sm"
                size={64}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-green-600">
                Venta procesada
              </p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
                #{data.nroFactura}
              </p>
            </div>
          </div>

          {/* Datos principales */}
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            <Row label="Cliente" value={data.clienteNombre} />
            <Row
              label="Total"
              value={
                <span className="font-bold text-foreground">
                  {formatUsd(data.totalUsd)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {formatBs(data.totalBs)}
                  </span>
                </span>
              }
            />
            <Row
              label="Estado"
              value={
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    data.tipo === 'CONTADO'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      data.tipo === 'CONTADO' ? 'bg-green-500' : 'bg-orange-500'
                    }`}
                  />
                  {data.tipo}
                </span>
              }
            />
            {data.tipo === 'CREDITO' && saldoPendUsd > 0.01 && (
              <Row
                label="Pendiente"
                value={
                  <span className="font-semibold text-orange-600">
                    {formatUsd(saldoPendUsd)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {formatBs(usdToBs(saldoPendUsd, data.tasa))}
                    </span>
                  </span>
                }
              />
            )}
          </div>

          {/* Desglose de pagos */}
          {(data.pagos.length > 0 || (data.cargosEspeciales ?? []).length > 0) && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                Pagos registrados
              </p>
              <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {data.pagos.map((p, i) => {
                  const equiv =
                    p.moneda === 'BS' ? Number((p.monto / data.tasa).toFixed(2)) : p.monto
                  return (
                    <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{p.metodo_nombre}</span>
                        {p.referencia && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Ref: {p.referencia}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-semibold tabular-nums">
                          {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                        </span>
                        {p.moneda === 'BS' && (
                          <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                            ({formatUsd(equiv)})
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(data.cargosEspeciales ?? []).map((cargo, i) => (
                  <div key={`cargo-${i}`} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          cargo.tipo === 'PRESTAMO'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {cargo.tipo}
                      </span>
                      <span className="text-muted-foreground truncate">{cargo.descripcion}</span>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatUsd(cargo.montoCargoUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <Button
            className="w-full"
            size="lg"
            onClick={onClose}
            autoFocus
          >
            Nueva Venta
          </Button>
        </div>
      </div>
    </div>
  )
}

// Componente auxiliar para filas de datos
function Row({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
