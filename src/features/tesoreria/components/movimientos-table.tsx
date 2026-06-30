import { CheckCircle, Clock, X, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import type { MovBancario } from '@/features/caja/hooks/use-mov-bancarios'
import type { MovCajaFuerte } from '../hooks/use-mov-caja-fuerte'

// ─── Tipo legado (mantenido para retrocompatibilidad con ReversoModal) ──────

export type MovimientoTesoreria =
  | (MovBancario & { _source: 'BANCO' })
  | (MovCajaFuerte & { _source: 'CAJA_FUERTE' })

// ─── Tipo de fila para la tabla nueva ────────────────────────

export interface MovimientoTableRow {
  id: string
  tipo: string           // INGRESO | EGRESO
  origen: string
  referencia: string | null
  descripcion: string | null
  monto: string
  saldo_nuevo: string
  fecha: string
  created_at: string
  validado: number
  reversado: number
  onValidar?: (id: string) => void
  onReversar?: (id: string) => void
}

// ─── Labels de origen ────────────────────────────────────────

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  DEPOSITO_CIERRE: 'Cierre de caja',
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

// ─── Helpers ─────────────────────────────────────────────────

function formatFechaHora(fecha: string, createdAt: string): string {
  const datePart = String(fecha).slice(0, 10)   // "YYYY-MM-DD"
  const timePart = String(createdAt).slice(11, 16) // "HH:mm"
  const parts = datePart.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]} ${timePart}`
  }
  return `${datePart} ${timePart}`
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  movimientos: MovimientoTableRow[]
  modo: 'pendiente' | 'historico'
  pagination?: {
    page: number
    totalPages: number
    total: number
    onPageChange: (page: number) => void
  }
  loading?: boolean
  monedaSimbolo?: string
}

// ─── Componente principal ─────────────────────────────────────

export function MovimientosTable({
  movimientos,
  modo,
  pagination,
  loading = false,
  monedaSimbolo = '$',
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
        <Clock size={20} className="opacity-40 animate-pulse" />
        <span>Cargando movimientos...</span>
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
        <Clock size={32} className="opacity-30" />
        <p>
          {modo === 'pendiente'
            ? 'No hay movimientos pendientes'
            : 'No hay movimientos para el periodo seleccionado'}
        </p>
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
                <th className="text-left py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">
                  Fecha / Hora
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                  Referencia
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                  Modulo origen
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Ingreso
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Egreso
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Saldo
                </th>
                {modo === 'historico' && (
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                    Estado
                  </th>
                )}
                {modo === 'pendiente' && (
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {movimientos.map((mov) => (
                <MovRow
                  key={mov.id}
                  mov={mov}
                  modo={modo}
                  monedaSimbolo={monedaSimbolo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>{pagination.total} registros</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <CaretLeft size={14} />
              Anterior
            </Button>
            <span className="tabular-nums">
              Pagina {pagination.page} de {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Siguiente
              <CaretRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Fila de movimiento ───────────────────────────────────────

function MovRow({
  mov,
  modo,
  monedaSimbolo,
}: {
  mov: MovimientoTableRow
  modo: 'pendiente' | 'historico'
  monedaSimbolo: string
}) {
  const isReversado = mov.reversado === 1
  const isValidado = mov.validado === 1
  const monto = parseFloat(mov.monto)

  return (
    <tr
      className={cn(
        'hover:bg-muted/30 transition-colors',
        isReversado && 'opacity-50'
      )}
    >
      {/* Fecha / Hora */}
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatFechaHora(mov.fecha, mov.created_at)}
      </td>

      {/* Referencia */}
      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[120px] truncate">
        {mov.referencia ?? '-'}
      </td>

      {/* Modulo origen */}
      <td className="py-3 px-4">
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium w-fit',
              ORIGEN_COLORS[mov.origen] ?? 'bg-gray-100 text-gray-600'
            )}
          >
            {ORIGEN_LABELS[mov.origen] ?? mov.origen}
          </span>
          {mov.descripcion && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {mov.descripcion}
            </span>
          )}
        </div>
      </td>

      {/* Ingreso */}
      <td className="py-3 px-4 text-right tabular-nums">
        {mov.tipo === 'INGRESO' ? (
          <span className="text-green-700 font-medium text-sm">
            {monedaSimbolo} {formatUsd(monto)}
          </span>
        ) : null}
      </td>

      {/* Egreso */}
      <td className="py-3 px-4 text-right tabular-nums">
        {mov.tipo === 'EGRESO' ? (
          <span className="text-red-700 font-medium text-sm">
            {monedaSimbolo} {formatUsd(monto)}
          </span>
        ) : null}
      </td>

      {/* Saldo */}
      <td className="py-3 px-4 text-right tabular-nums text-xs text-muted-foreground">
        {monedaSimbolo} {formatUsd(parseFloat(mov.saldo_nuevo))}
      </td>

      {/* Estado (solo historico) */}
      {modo === 'historico' && (
        <td className="py-3 px-4 text-center">
          <EstadoBadge validado={isValidado} reversado={isReversado} />
        </td>
      )}

      {/* Acciones (solo pendiente) */}
      {modo === 'pendiente' && (
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-1">
            {!isReversado && !isValidado && mov.onValidar && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-green-700 hover:bg-green-50"
                onClick={() => mov.onValidar!(mov.id)}
              >
                Validar
              </Button>
            )}
            {!isReversado && mov.onReversar && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => mov.onReversar!(mov.id)}
              >
                Reversar
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

// ─── Badge de estado ──────────────────────────────────────────

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
