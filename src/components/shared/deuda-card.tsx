import { cn } from '@/lib/utils'

export interface DeudaCardProps {
  /** Identificador de la fila (factura, gasto, etc.), se pasa a `onAccion`. */
  id: string
  /** Numero de documento (nro. de factura, nro. de gasto, etc.). */
  numero: string
  /** Texto secundario opcional bajo el numero (ej. descripcion de un gasto). */
  detalle?: string
  /** Fecha ya formateada para mostrar. */
  fecha: string
  /** Texto del badge de tipo (ej. CONTADO / CREDITO). Si se omite, no se muestra badge. */
  tipo?: string
  /** Tono visual del badge de tipo. Default 'contado' (verde). */
  tipoTono?: 'credito' | 'contado'
  /** Total ya formateado en USD. */
  totalUsd: string
  /** Total ya formateado en Bs (opcional). */
  totalBs?: string
  /** Pendiente ya formateado en USD. */
  pendienteUsd: string
  /** Pendiente ya formateado en Bs, equivalente (opcional). */
  pendienteBs?: string
  /** Si el pendiente debe resaltarse en rojo (deuda activa). Default true. */
  pendienteDestacado?: boolean
  /** Texto del boton de accion. Default 'Pagar'. */
  accionLabel?: string
  /** Deshabilita el boton de accion. */
  accionDisabled?: boolean
  /** Callback al presionar el boton de accion, recibe el id de la fila. */
  onAccion: (id: string) => void
}

export function DeudaCard({
  id,
  numero,
  detalle,
  fecha,
  tipo,
  tipoTono = 'contado',
  totalUsd,
  totalBs,
  pendienteUsd,
  pendienteBs,
  pendienteDestacado = true,
  accionLabel = 'Pagar',
  accionDisabled = false,
  onAccion,
}: DeudaCardProps) {
  return (
    <div className="rounded-2xl bg-card shadow-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-foreground truncate">{numero}</p>
          {detalle && <p className="text-xs text-muted-foreground truncate">{detalle}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">{fecha}</p>
        </div>
        {tipo && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset shrink-0',
              tipoTono === 'credito'
                ? 'bg-orange-50 text-orange-700 ring-orange-600/20'
                : 'bg-green-50 text-green-700 ring-green-600/20'
            )}
          >
            {tipo}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{totalUsd}</p>
          {totalBs && <p className="text-[10px] text-muted-foreground/70 tabular-nums">{totalBs}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pendiente</p>
          <p
            className={cn(
              'text-sm font-bold tabular-nums',
              pendienteDestacado ? 'text-destructive' : 'text-green-600'
            )}
          >
            {pendienteUsd}
          </p>
          {pendienteBs && <p className="text-[10px] text-muted-foreground/70 tabular-nums">{pendienteBs}</p>}
        </div>
      </div>

      <button
        type="button"
        disabled={accionDisabled}
        onClick={() => onAccion(id)}
        className={cn(
          'w-full inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-xl transition-colors',
          accionDisabled
            ? 'text-muted-foreground bg-muted cursor-not-allowed'
            : 'text-primary-foreground bg-primary hover:bg-primary/90'
        )}
      >
        {accionLabel}
      </button>
    </div>
  )
}
