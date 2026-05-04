import { CheckCircle, Clock, X, ArrowDown, ArrowUp } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import type { MovBancario } from '@/features/caja/hooks/use-mov-bancarios'
import type { MovCajaFuerte } from '../hooks/use-mov-caja-fuerte'

// ─── Tipo unificado ──────────────────────────────────────────

export type MovimientoTesoreria =
  | (MovBancario & { _source: 'BANCO'; reversado?: number; reverso_de?: string | null; descripcion?: string | null })
  | (MovCajaFuerte & { _source: 'CAJA_FUERTE' })

// ─── Labels ─────────────────────────────────────────────────

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  DEPOSITO_CIERRE: 'Cierre caja',
  TRANSFERENCIA_CLIENTE: 'Cobro cliente',
  PAGO_PROVEEDOR: 'Pago proveedor',
  GASTO: 'Gasto',
  TRASPASO: 'Traspaso',
  REVERSO: 'Reverso',
  MANUAL: 'Manual',
}

const ORIGEN_COLORS: Record<string, string> = {
  DEPOSITO_CAJA: 'bg-green-100 text-green-700',
  DEPOSITO_CIERRE: 'bg-emerald-100 text-emerald-700',
  TRANSFERENCIA_CLIENTE: 'bg-blue-100 text-blue-700',
  PAGO_PROVEEDOR: 'bg-orange-100 text-orange-700',
  GASTO: 'bg-red-100 text-red-700',
  TRASPASO: 'bg-purple-100 text-purple-700',
  REVERSO: 'bg-gray-100 text-gray-600',
  MANUAL: 'bg-yellow-100 text-yellow-700',
}

// ─── Tipos suma (para footer) ────────────────────────────────

interface SummaryData {
  totalIngresos: number
  totalEgresos: number
}

function calcSummary(movimientos: MovimientoTesoreria[]): SummaryData {
  return movimientos.reduce(
    (acc, m) => {
      if (m.reversado === 1) return acc
      const monto = parseFloat(m.monto)
      if (m.tipo === 'INGRESO') acc.totalIngresos += monto
      else acc.totalEgresos += monto
      return acc
    },
    { totalIngresos: 0, totalEgresos: 0 }
  )
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  movimientos: MovimientoTesoreria[]
  isLoading: boolean
  monedaSimbolo: string
  onValidar: (mov: MovimientoTesoreria) => void
  onReversar: (mov: MovimientoTesoreria) => void
}

export function MovimientosTable({
  movimientos,
  isLoading,
  monedaSimbolo,
  onValidar,
  onReversar,
}: Props) {
  const { totalIngresos, totalEgresos } = calcSummary(movimientos)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Cargando movimientos...
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <Clock size={32} className="opacity-30" />
        <p>No hay movimientos para el periodo seleccionado</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Origen</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Descripcion</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Monto</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Saldo post</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Estado</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movimientos.map((mov) => (
                <MovRow
                  key={mov.id}
                  mov={mov}
                  monedaSimbolo={monedaSimbolo}
                  onValidar={onValidar}
                  onReversar={onReversar}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border bg-green-50 p-3">
          <p className="text-xs text-muted-foreground mb-1">Total ingresos</p>
          <p className="font-semibold text-green-700">
            {monedaSimbolo} {formatUsd(totalIngresos)}
          </p>
        </div>
        <div className="rounded-lg border bg-red-50 p-3">
          <p className="text-xs text-muted-foreground mb-1">Total egresos</p>
          <p className="font-semibold text-red-700">
            {monedaSimbolo} {formatUsd(totalEgresos)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1">Neto</p>
          <p
            className={cn(
              'font-semibold tabular-nums',
              totalIngresos - totalEgresos >= 0 ? 'text-foreground' : 'text-destructive'
            )}
          >
            {monedaSimbolo} {formatUsd(totalIngresos - totalEgresos)}
          </p>
        </div>
      </div>
    </div>
  )
}

function MovRow({
  mov,
  monedaSimbolo,
  onValidar,
  onReversar,
}: {
  mov: MovimientoTesoreria
  monedaSimbolo: string
  onValidar: (m: MovimientoTesoreria) => void
  onReversar: (m: MovimientoTesoreria) => void
}) {
  const isReversado = mov.reversado === 1
  const isValidado = mov.validado === 1

  const descripcion =
    ('descripcion' in mov && mov.descripcion) ||
    ('observacion' in mov && (mov as MovBancario).observacion) ||
    '—'

  return (
    <tr className={cn('hover:bg-muted/30 transition-colors', isReversado && 'opacity-50')}>
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        {String(mov.fecha).slice(0, 10)}
      </td>
      <td className="py-3 px-4">
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            ORIGEN_COLORS[mov.origen] ?? 'bg-gray-100 text-gray-600'
          )}
        >
          {ORIGEN_LABELS[mov.origen] ?? mov.origen}
        </span>
      </td>
      <td className="py-3 px-4 max-w-[200px]">
        <p className="text-xs text-muted-foreground truncate">{descripcion}</p>
      </td>
      <td className="py-3 px-4 text-center">
        {mov.tipo === 'INGRESO' ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <ArrowDown size={12} weight="bold" />
            IN
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
            <ArrowUp size={12} weight="bold" />
            OUT
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-right tabular-nums font-medium text-sm">
        <span className={mov.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-700'}>
          {monedaSimbolo} {formatUsd(parseFloat(mov.monto))}
        </span>
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-xs text-muted-foreground">
        {monedaSimbolo} {formatUsd(parseFloat(mov.saldo_nuevo))}
      </td>
      <td className="py-3 px-4 text-center">
        <EstadoBadge validado={isValidado} reversado={isReversado} />
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {!isReversado && !isValidado && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-green-700 hover:bg-green-50"
              onClick={() => onValidar(mov)}
            >
              Validar
            </Button>
          )}
          {!isReversado && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => onReversar(mov)}
            >
              Reversar
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function EstadoBadge({
  validado,
  reversado,
}: {
  validado: boolean
  reversado: boolean
}) {
  if (reversado) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <X size={12} />
        Reversado
      </span>
    )
  }
  if (validado) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle size={12} weight="fill" />
        Validado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <Clock size={12} weight="fill" />
      Pendiente
    </span>
  )
}
