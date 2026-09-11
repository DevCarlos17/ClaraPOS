import { useState } from 'react'
import { MagnifyingGlass, FileText, Users, Package, ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatUsd } from '@/lib/currency'
import { formatDate, formatNumber } from '@/lib/format'
import { todayStr } from '@/lib/dates'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useBuscarProductosVenta, type ProductoVenta } from '@/features/ventas/hooks/use-ventas'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'
import { FacturasEmpresaTable } from '@/features/ventas/components/facturas-empresa-tab'
import { ConsultaFacturaModal } from '@/features/ventas/components/consulta-factura-modal'
import type { FacturaParaAnular } from '@/features/ventas/hooks/use-notas-credito'
import { useVentasPorProducto } from '../hooks/use-ventas-reportes'

/**
 * Fecha de inicio "historica" (replicar-consulta-factura-ventas-caja, Design
 * §Decision "Historical search preserved"): `useFacturasEmpresa` por defecto
 * limita al mes actual (`rangoMesActual()`); su escape hatch documentado
 * para "ver todo el historico" es pasar un `fechaDesde` explicito y amplio
 * — sin este valor, "Por Factura"/"Por Cliente" perderian la busqueda de
 * facturas de meses anteriores que tenian antes del swap de hook.
 */
const FECHA_INICIO_HISTORICO = '2000-01-01'

interface VentasConsultasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VentasConsultasModal({ open, onOpenChange }: VentasConsultasModalProps) {
  // Slice A: reemplaza el ternario "seleccionar factura -> renderizar
  // FacturaDetalle inline" por el mismo patron de `cliente-detalle.tsx` —
  // un estado al tope + `ConsultaFacturaModal` montado como Dialog hermano.
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)

  function handleClose() {
    setFacturaSeleccionada(null)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Consultas de Ventas</DialogTitle>
            <DialogDescription>Busque facturas por numero, cliente o producto</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="factura" className="flex-1 min-h-0">
            <TabsList className="w-full">
              <TabsTrigger value="factura" className="flex-1 gap-1.5">
                <FileText className="size-3.5" />
                Por Factura
              </TabsTrigger>
              <TabsTrigger value="cliente" className="flex-1 gap-1.5">
                <Users className="size-3.5" />
                Por Cliente
              </TabsTrigger>
              <TabsTrigger value="producto" className="flex-1 gap-1.5">
                <Package className="size-3.5" />
                Por Producto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="factura" forceMount className="mt-4 overflow-y-auto max-h-[60vh] data-[state=inactive]:hidden">
              <BuscarPorFactura onRowClick={setFacturaSeleccionada} />
            </TabsContent>

            <TabsContent value="cliente" forceMount className="mt-4 overflow-y-auto max-h-[60vh] data-[state=inactive]:hidden">
              <BuscarPorCliente onRowClick={setFacturaSeleccionada} />
            </TabsContent>

            <TabsContent value="producto" forceMount className="mt-4 overflow-y-auto max-h-[60vh] data-[state=inactive]:hidden">
              <BuscarPorProducto />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConsultaFacturaModal
        venta={facturaSeleccionada}
        isOpen={!!facturaSeleccionada}
        onClose={() => setFacturaSeleccionada(null)}
      />
    </>
  )
}

// ─── Tab: Buscar por Factura ────────────────────────────────

function BuscarPorFactura({ onRowClick }: { onRowClick: (f: FacturaParaAnular) => void }) {
  const [query, setQuery] = useState('')
  const busqueda = query.trim()
  const { facturas, isLoading } = useFacturasEmpresa({
    busqueda,
    fechaDesde: FECHA_INICIO_HISTORICO,
    fechaHasta: todayStr(),
    enabled: busqueda.length > 0,
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escriba el numero de factura..."
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {busqueda.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          Escriba un numero de factura para buscar
        </p>
      ) : (
        <FacturasEmpresaTable
          facturas={facturas}
          isLoading={isLoading}
          mostrarAcciones={false}
          onRowClick={onRowClick}
        />
      )}
    </div>
  )
}

// ─── Tab: Buscar por Cliente ────────────────────────────────

function BuscarPorCliente({ onRowClick }: { onRowClick: (f: FacturaParaAnular) => void }) {
  const [clienteQuery, setClienteQuery] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string } | null>(null)
  const { clientes, isLoading: loadingClientes } = useBuscarClientes(clienteQuery)
  const { facturas, isLoading: loadingFacturas } = useFacturasEmpresa({
    clienteId: selectedCliente?.id,
    fechaDesde: FECHA_INICIO_HISTORICO,
    fechaHasta: todayStr(),
    enabled: !!selectedCliente,
  })

  if (selectedCliente) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCliente(null)}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="text-sm font-medium">{selectedCliente.nombre}</p>
            <p className="text-xs text-muted-foreground">{facturas.length} factura(s)</p>
          </div>
        </div>

        <FacturasEmpresaTable
          facturas={facturas}
          isLoading={loadingFacturas}
          mostrarAcciones={false}
          onRowClick={onRowClick}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={clienteQuery}
          onChange={(e) => setClienteQuery(e.target.value)}
          placeholder="Buscar cliente por nombre o identificacion..."
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loadingClientes ? (
        <LoadingSkeleton />
      ) : clienteQuery.trim().length < 2 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          Escriba al menos 2 caracteres para buscar
        </p>
      ) : clientes.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          No se encontraron clientes
        </p>
      ) : (
        <div className="space-y-1">
          {clientes.map((c: Cliente) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedCliente({ id: c.id, nombre: c.nombre })
                setClienteQuery('')
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors border"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">{c.identificacion}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  Saldo: {formatUsd(c.saldo_actual)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Buscar por Producto ───────────────────────────────

function BuscarPorProducto() {
  const [prodQuery, setProdQuery] = useState('')
  const [selectedProducto, setSelectedProducto] = useState<{ id: string; codigo: string; nombre: string } | null>(null)
  const { productos, isLoading: loadingProductos } = useBuscarProductosVenta(prodQuery)
  const { ventas, isLoading: loadingVentas } = useVentasPorProducto(selectedProducto?.id ?? '')

  if (selectedProducto) {
    const totalCantidad = ventas.reduce((s, v) => s + v.cantidad, 0)
    const totalSubtotal = ventas.reduce((s, v) => s + v.subtotal, 0)

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedProducto(null)}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="text-sm font-medium">{selectedProducto.codigo} - {selectedProducto.nombre}</p>
            <p className="text-xs text-muted-foreground">{ventas.length} venta(s)</p>
          </div>
        </div>

        {loadingVentas ? (
          <LoadingSkeleton />
        ) : ventas.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Este producto no tiene ventas registradas
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Factura</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Cant.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">P.Unit</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => (
                  <tr key={`${v.nroFactura}-${i}`} className="border-b border-muted">
                    <td className="px-2 py-2 font-mono text-xs">{v.nroFactura}</td>
                    <td className="px-2 py-2 truncate max-w-[100px]">{v.clienteNombre}</td>
                    <td className="px-2 py-2 text-xs">{formatDate(v.fecha)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(v.cantidad, 0)}</td>
                    <td className="px-2 py-2 text-right">{formatUsd(v.precioUnitario)}</td>
                    <td className="px-2 py-2 text-right font-medium">{formatUsd(v.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="px-2 py-2" colSpan={3}>Total ({ventas.length} registros)</td>
                  <td className="px-2 py-2 text-right">{formatNumber(totalCantidad, 0)}</td>
                  <td />
                  <td className="px-2 py-2 text-right">{formatUsd(totalSubtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={prodQuery}
          onChange={(e) => setProdQuery(e.target.value)}
          placeholder="Buscar producto por nombre o codigo..."
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loadingProductos ? (
        <LoadingSkeleton />
      ) : prodQuery.trim().length < 2 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          Escriba al menos 2 caracteres para buscar
        </p>
      ) : productos.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          No se encontraron productos
        </p>
      ) : (
        <div className="space-y-1">
          {productos.map((p: ProductoVenta) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelectedProducto({ id: p.id, codigo: p.codigo, nombre: p.nombre })
                setProdQuery('')
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors border"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    <span className="text-muted-foreground">{p.codigo}</span> - {p.nombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.tipo === 'S' ? 'Servicio' : `Stock: ${parseFloat(p.stock).toFixed(3)}`}
                  </p>
                </div>
                <span className="text-sm font-medium shrink-0">{formatUsd(p.precio_venta_usd)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers compartidos ────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-10 bg-muted rounded animate-pulse" />
      ))}
    </div>
  )
}
