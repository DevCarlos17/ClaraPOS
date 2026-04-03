import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd, formatTasa, usdToBs } from '@/lib/currency'
import { crearVenta, type ProductoVenta } from '../hooks/use-ventas'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import { ClienteSelector } from './cliente-selector'
import { ProductoBuscador } from './producto-buscador'
import { LineaItems } from './linea-items'
import { PagoModal } from './pago-modal'

export function PosTerminal() {
  const { tasaValor, isLoading: tasaLoading } = useTasaActual()
  const { user } = useCurrentUser()

  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [tipoVenta, setTipoVenta] = useState<'CONTADO' | 'CREDITO'>('CONTADO')
  const [lineas, setLineas] = useState<LineaVentaForm[]>([])
  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const totalUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario_usd, 0)
  const totalBs = usdToBs(totalUsd, tasaValor)

  const handleSelectCliente = (cliente: Cliente) => {
    setClienteId(cliente.id)
    setClienteNombre(cliente.nombre_social)
  }

  const handleClearCliente = () => {
    setClienteId(null)
    setClienteNombre('')
  }

  const handleSelectProducto = (producto: ProductoVenta) => {
    // Si ya existe, incrementar cantidad
    const existing = lineas.findIndex((l) => l.producto_id === producto.id)
    if (existing >= 0) {
      setLineas((prev) =>
        prev.map((l, i) => (i === existing ? { ...l, cantidad: l.cantidad + 1 } : l))
      )
      return
    }

    setLineas((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        tipo: producto.tipo,
        cantidad: 1,
        precio_unitario_usd: parseFloat(producto.precio_venta_usd),
      },
    ])
  }

  const handleUpdateCantidad = (index: number, cantidad: number) => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, cantidad } : l)))
  }

  const handleUpdatePrecio = (index: number, precio: number) => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, precio_unitario_usd: precio } : l)))
  }

  const handleRemoveLinea = (index: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  const handleOpenPago = () => {
    if (!clienteId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (lineas.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (tasaValor <= 0) {
      toast.error('No hay tasa de cambio configurada')
      return
    }
    setPagoModalOpen(true)
  }

  const handleConfirmVenta = async (pagos: PagoEntryForm[]) => {
    if (!clienteId || !user) return

    setSubmitting(true)
    try {
      const result = await crearVenta({
        cliente_id: clienteId,
        tipo: tipoVenta,
        tasa: tasaValor,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario_usd: l.precio_unitario_usd,
        })),
        pagos: pagos.map((p) => ({
          metodo_pago_id: p.metodo_pago_id,
          moneda: p.moneda,
          monto: p.monto,
          referencia: p.referencia,
        })),
        usuario_id: user.id,
      })

      toast.success(`Venta #${result.nroFactura} creada exitosamente`)

      // Reset POS
      setClienteId(null)
      setClienteNombre('')
      setTipoVenta('CONTADO')
      setLineas([])
      setPagoModalOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la venta')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelar = () => {
    setClienteId(null)
    setClienteNombre('')
    setTipoVenta('CONTADO')
    setLineas([])
  }

  if (tasaLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Cargando...
      </div>
    )
  }

  if (tasaValor <= 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hay tasa de cambio configurada. Configura una tasa antes de realizar ventas.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header: Cliente + Tipo + Tasa */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-start">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Cliente</label>
          <ClienteSelector
            clienteId={clienteId}
            onSelect={handleSelectCliente}
            onClear={handleClearCliente}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setTipoVenta('CONTADO')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tipoVenta === 'CONTADO'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Contado
            </button>
            <button
              type="button"
              onClick={() => setTipoVenta('CREDITO')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tipoVenta === 'CREDITO'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Credito
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tasa</label>
          <div className="rounded-lg border bg-muted/50 px-4 py-2 text-sm">
            <span className="font-medium">{formatTasa(tasaValor)}</span>
            <span className="text-muted-foreground ml-1">Bs/USD</span>
          </div>
        </div>
      </div>

      {/* Buscar producto */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Agregar producto</label>
        <ProductoBuscador onSelect={handleSelectProducto} />
      </div>

      {/* Lineas */}
      <LineaItems
        lineas={lineas}
        tasa={tasaValor}
        onUpdateCantidad={handleUpdateCantidad}
        onUpdatePrecio={handleUpdatePrecio}
        onRemove={handleRemoveLinea}
      />

      {/* Barra de acciones */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={handleCancelar} disabled={submitting}>
          Cancelar
        </Button>

        <div className="flex items-center gap-4">
          {clienteId && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <Badge variant="outline">{clienteNombre}</Badge>
              <Badge variant={tipoVenta === 'CREDITO' ? 'destructive' : 'default'}>
                {tipoVenta}
              </Badge>
            </div>
          )}
          <Button onClick={handleOpenPago} disabled={submitting || lineas.length === 0}>
            <ShoppingCart size={16} className="mr-2" />
            Procesar Pago - {formatUsd(totalUsd)}
          </Button>
        </div>
      </div>

      {/* Modal de pago */}
      <PagoModal
        open={pagoModalOpen}
        onClose={() => setPagoModalOpen(false)}
        totalUsd={totalUsd}
        totalBs={totalBs}
        tasa={tasaValor}
        tipoVenta={tipoVenta}
        nroFacturaPreview="(nuevo)"
        onConfirm={handleConfirmVenta}
        submitting={submitting}
      />
    </div>
  )
}
