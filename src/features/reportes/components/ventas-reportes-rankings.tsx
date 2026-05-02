import { useState } from 'react'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { formatDate } from '@/lib/format'
import {
  useTopProductosVentas,
  useTopClientesVentas,
  useFacturasCliente,
  useVentasProducto,
} from '../hooks/use-ventas-reportes'
import type { TopProductoVentas, TopClienteVentas } from '../hooks/use-ventas-reportes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface VentasReportesRankingsProps {
  fechaDesde: string
  fechaHasta: string
}

export function VentasReportesRankings({ fechaDesde, fechaHasta }: VentasReportesRankingsProps) {
  const { productos, isLoading: loadingProductos } = useTopProductosVentas(fechaDesde, fechaHasta)
  const { clientes, isLoading: loadingClientes } = useTopClientesVentas(fechaDesde, fechaHasta)

  const [selectedProducto, setSelectedProducto] = useState<TopProductoVentas | null>(null)
  const [selectedCliente, setSelectedCliente] = useState<TopClienteVentas | null>(null)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductosTable
          productos={productos}
          isLoading={loadingProductos}
          onSelect={setSelectedProducto}
        />
        <ClientesTable
          clientes={clientes}
          isLoading={loadingClientes}
          onSelect={setSelectedCliente}
        />
      </div>

      <ProductoDetailModal
        producto={selectedProducto}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onClose={() => setSelectedProducto(null)}
      />

      <ClienteDetailModal
        cliente={selectedCliente}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onClose={() => setSelectedCliente(null)}
      />
    </>
  )
}

// ─── Tabla Productos ────────────────────────────────────────

function ProductosTable({
  productos,
  isLoading,
  onSelect,
}: {
  productos: TopProductoVentas[]
  isLoading: boolean
  onSelect: (p: TopProductoVentas) => void
}) {
  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold">Top 10 Productos</h3>
      <p className="text-xs text-muted-foreground mb-3">Mas vendidos en el periodo (clic para ver detalle)</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin ventas en este periodo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Codigo</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Producto</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Cant.</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p, i) => (
                <tr
                  key={p.productoId}
                  className="border-b border-muted cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onSelect(p)}
                >
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-xs">{p.codigo}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[120px]">{p.nombre}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(p.cantidad, 0)}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatUsd(p.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tabla Clientes ─────────────────────────────────────────

function ClientesTable({
  clientes,
  isLoading,
  onSelect,
}: {
  clientes: TopClienteVentas[]
  isLoading: boolean
  onSelect: (c: TopClienteVentas) => void
}) {
  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold">Top 10 Clientes</h3>
      <p className="text-xs text-muted-foreground mb-3">Mayor volumen de compras (clic para ver detalle)</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin ventas en este periodo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Identificacion</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Fact.</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr
                  key={c.clienteId}
                  className="border-b border-muted cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onSelect(c)}
                >
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[120px]">{c.nombre}</td>
                  <td className="px-2 py-2 font-mono text-xs">{c.identificacion}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(c.facturas, 0)}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatUsd(c.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Modal Detalle Cliente ──────────────────────────────────

function ClienteDetailModal({
  cliente,
  fechaDesde,
  fechaHasta,
  onClose,
}: {
  cliente: TopClienteVentas | null
  fechaDesde: string
  fechaHasta: string
  onClose: () => void
}) {
  const { facturas, isLoading } = useFacturasCliente(
    cliente?.clienteId ?? '',
    fechaDesde,
    fechaHasta
  )

  const totalUsd = facturas.reduce((sum, f) => sum + f.totalUsd, 0)
  const totalBs = facturas.reduce((sum, f) => sum + f.totalBs, 0)

  return (
    <Dialog open={!!cliente} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facturas de {cliente?.nombre}</DialogTitle>
          <DialogDescription>
            {cliente?.identificacion} &middot; Periodo: {fechaDesde} al {fechaHasta}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : facturas.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Sin facturas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Nro Factura</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total Bs</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.nroFactura} className="border-b border-muted">
                    <td className="px-2 py-2 font-mono text-xs">{f.nroFactura}</td>
                    <td className="px-2 py-2">{formatDate(f.fecha)}</td>
                    <td className="px-2 py-2 text-right font-medium">{formatUsd(f.totalUsd)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{formatBs(f.totalBs)}</td>
                    <td className="px-2 py-2 text-center">
                      <StatusBadge status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="px-2 py-2" colSpan={2}>Total ({facturas.length} facturas)</td>
                  <td className="px-2 py-2 text-right">{formatUsd(totalUsd)}</td>
                  <td className="px-2 py-2 text-right">{formatBs(totalBs)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal Detalle Producto ─────────────────────────────────

function ProductoDetailModal({
  producto,
  fechaDesde,
  fechaHasta,
  onClose,
}: {
  producto: TopProductoVentas | null
  fechaDesde: string
  fechaHasta: string
  onClose: () => void
}) {
  const { ventas, isLoading } = useVentasProducto(
    producto?.productoId ?? '',
    fechaDesde,
    fechaHasta
  )

  const totalCantidad = ventas.reduce((sum, v) => sum + v.cantidad, 0)
  const totalSubtotal = ventas.reduce((sum, v) => sum + v.subtotal, 0)

  return (
    <Dialog open={!!producto} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ventas de {producto?.nombre}</DialogTitle>
          <DialogDescription>
            Codigo: {producto?.codigo} &middot; Periodo: {fechaDesde} al {fechaHasta}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : ventas.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Sin ventas</p>
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
                    <td className="px-2 py-2 truncate max-w-[120px]">{v.clienteNombre}</td>
                    <td className="px-2 py-2">{formatDate(v.fecha)}</td>
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
      </DialogContent>
    </Dialog>
  )
}

// ─── Status Badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase()
  const styles =
    upper === 'ANULADA'
      ? 'bg-red-100 text-red-700'
      : upper === 'PAGADA'
        ? 'bg-green-100 text-green-700'
        : 'bg-amber-100 text-amber-700'

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {upper}
    </span>
  )
}
