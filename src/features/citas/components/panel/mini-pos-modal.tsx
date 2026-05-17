import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQuery } from '@powersync/react'
import {
  useCitaExtras,
  agregarItemExtra,
  removerItemExtra,
  calcularTotalExtras,
  type CitaItemExtra,
} from '../../hooks/use-cita-extras'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { formatUsd } from '@/lib/currency'
import { Trash, WarningCircle, ShoppingBag } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { Cita } from '../../hooks/use-citas'

interface MiniPosModalProps {
  cita: Cita
  userId: string
  onClose: () => void
}

interface ProductoResult {
  id: string
  nombre: string
  precio_venta_usd: string
}

function ExtraItem({
  extra,
  onRemover,
}: {
  extra: CitaItemExtra
  onRemover: () => void
}) {
  const subtotal = parseFloat(extra.precio_usd) * parseFloat(extra.cantidad)
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{extra.producto_nombre}</p>
        <p className="text-xs text-muted-foreground">
          {parseFloat(extra.cantidad).toFixed(0)} x {formatUsd(parseFloat(extra.precio_usd))}
        </p>
      </div>
      <span className="text-sm font-semibold shrink-0">{formatUsd(subtotal)}</span>
      {extra.status_cobro === 'PENDIENTE' && (
        <button
          className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
          onClick={onRemover}
          aria-label="Remover item"
        >
          <Trash size={13} />
        </button>
      )}
    </div>
  )
}

export function MiniPosModal({ cita, userId, onClose }: MiniPosModalProps) {
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const { extras } = useCitaExtras(cita.id)

  const { data: productosData } = useQuery(
    busqueda.length >= 2
      ? 'SELECT id, nombre, precio_venta_usd FROM productos WHERE empresa_id = ? AND is_active = 1 AND nombre LIKE ? ORDER BY nombre LIMIT 10'
      : '',
    busqueda.length >= 2 ? [cita.empresa_id, `%${busqueda}%`] : []
  )
  const productos = (productosData ?? []) as ProductoResult[]

  const totalExtras = calcularTotalExtras(extras)
  const yaEstabaPagada = cita.finance_status === 'PAGADO'

  const handleAgregar = async (producto: ProductoResult) => {
    setCargando(true)
    try {
      await agregarItemExtra({
        citaId: cita.id,
        empresaId: cita.empresa_id,
        productoId: producto.id,
        cantidad: 1,
        precioUsd: parseFloat(producto.precio_venta_usd),
        userId,
      })
      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: userId,
        accion: 'MINI_POS_ADD',
        datosNuevos: {
          productoId: producto.id,
          nombre: producto.nombre,
          precioUsd: producto.precio_venta_usd,
        },
      })
      setBusqueda('')
      toast.success(`${producto.nombre} agregado`)
    } catch {
      toast.error('Error al agregar item')
    } finally {
      setCargando(false)
    }
  }

  const handleRemover = async (itemId: string) => {
    try {
      await removerItemExtra(itemId)
    } catch {
      toast.error('Error al remover item')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag size={16} />
            Agregar Items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {yaEstabaPagada && extras.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
              <WarningCircle size={13} className="shrink-0 mt-0.5" />
              <span>
                Cita ya fue pagada. Los items extras quedaran pendientes de cobro en caja.
              </span>
            </div>
          )}

          {/* Buscador */}
          <div className="space-y-1.5">
            <Input
              placeholder="Buscar producto (min. 2 letras)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />

            {busqueda.length >= 2 && productos.length > 0 && (
              <div className="border rounded-lg divide-y max-h-36 overflow-y-auto bg-background shadow-sm">
                {productos.map((p) => (
                  <button
                    key={p.id}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
                    onClick={() => handleAgregar(p)}
                    disabled={cargando}
                  >
                    <span className="truncate flex-1 pr-2">{p.nombre}</span>
                    <span className="text-primary font-semibold shrink-0 text-xs">
                      {formatUsd(parseFloat(p.precio_venta_usd))}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {busqueda.length >= 2 && productos.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-1.5">Sin resultados</p>
            )}
          </div>

          {/* Lista de extras */}
          {extras.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Items agregados
              </p>
              <div className="border rounded-lg divide-y max-h-44 overflow-y-auto">
                {extras.map((extra) => (
                  <ExtraItem
                    key={extra.id}
                    extra={extra}
                    onRemover={() => handleRemover(extra.id)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between px-1 pt-0.5">
                <span className="text-sm font-semibold">Total extras:</span>
                <span className="text-sm font-bold text-primary">{formatUsd(totalExtras)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
