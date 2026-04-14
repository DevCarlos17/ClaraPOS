import { useState } from 'react'
import { Search, FileText, Users, Package, ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useBuscarProductosVenta, type ProductoVenta } from '@/features/ventas/hooks/use-ventas'
import { useDetalleFactura } from '@/features/ventas/hooks/use-notas-credito'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import {
  useBuscarFacturas,
  useFacturasPorCliente,
  useVentasPorProducto,
} from '../hooks/use-ventas-reportes'
import type { FacturaBusqueda } from '../hooks/use-ventas-reportes'

interface VentasConsultasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VentasConsultasModal({ open, onOpenChange }: VentasConsultasModalProps) {
  const [selectedFactura, setSelectedFactura] = useState<FacturaBusqueda | null>(null)

  function handleClose() {
    setSelectedFactura(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {selectedFactura ? (
          <FacturaDetalle
            factura={selectedFactura}
            onBack={() => setSelectedFactura(null)}
          />
        ) : (
          <>
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
                <BuscarPorFactura onSelect={setSelectedFactura} />
              </TabsContent>

              <TabsContent value="cliente" forceMount className="mt-4 overflow-y-auto max-h-[60vh] data-[state=inactive]:hidden">
                <BuscarPorCliente onSelect={setSelectedFactura} />
              </TabsContent>

              <TabsContent value="producto" forceMount className="mt-4 overflow-y-auto max-h-[60vh] data-[state=inactive]:hidden">
                <BuscarPorProducto />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab: Buscar por Factura ────────────────────────────────

function BuscarPorFactura({ onSelect }: { onSelect: (f: FacturaBusqueda) => void }) {
  const [query, setQuery] = useState('')
  const { facturas, isLoading } = useBuscarFacturas(query)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escriba el numero de factura..."
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : query.trim().length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          Escriba un numero de factura para buscar
        </p>
      ) : facturas.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">
          No se encontraron facturas
        </p>
      ) : (
        <FacturasList facturas={facturas} onSelect={onSelect} />
      )}
    </div>
  )
}

// ─── Tab: Buscar por Cliente ────────────────────────────────

function BuscarPorCliente({ onSelect }: { onSelect: (f: FacturaBusqueda) => void }) {
  const [clienteQuery, setClienteQuery] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string } | null>(null)
  const { clientes, isLoading: loadingClientes } = useBuscarClientes(clienteQuery)
  const { facturas, isLoading: loadingFacturas } = useFacturasPorCliente(selectedCliente?.id ?? '')

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

        {loadingFacturas ? (
          <LoadingSkeleton />
        ) : facturas.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Este cliente no tiene facturas
          </p>
        ) : (
          <FacturasList facturas={facturas} onSelect={onSelect} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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

// ─── Lista de facturas (reutilizada en tabs factura y cliente) ─

function FacturasList({
  facturas,
  onSelect,
}: {
  facturas: FacturaBusqueda[]
  onSelect: (f: FacturaBusqueda) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left px-2 py-2 font-medium text-muted-foreground">Nro</th>
            <th className="text-left px-2 py-2 font-medium text-muted-foreground">Fecha</th>
            <th className="text-left px-2 py-2 font-medium text-muted-foreground">Cliente</th>
            <th className="text-right px-2 py-2 font-medium text-muted-foreground">Total USD</th>
            <th className="text-center px-2 py-2 font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr
              key={f.id}
              className="border-b border-muted cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onSelect(f)}
            >
              <td className="px-2 py-2 font-mono text-xs font-medium">{f.nroFactura}</td>
              <td className="px-2 py-2 text-xs">{formatDate(f.fecha)}</td>
              <td className="px-2 py-2 truncate max-w-[120px]">{f.clienteNombre}</td>
              <td className="px-2 py-2 text-right font-medium">{formatUsd(f.totalUsd)}</td>
              <td className="px-2 py-2 text-center">
                <StatusBadge status={f.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Clic en una factura para ver su detalle completo
      </p>
    </div>
  )
}

// ─── Detalle completo de una factura ────────────────────────

function FacturaDetalle({
  factura,
  onBack,
}: {
  factura: FacturaBusqueda
  onBack: () => void
}) {
  const { detalles, pagos, isLoading } = useDetalleFactura(factura.id)
  const { company } = useCompany()
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_usd), 0)

  function handleImprimirPdf() {
    setGenerandoPdf(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 15

      // Cabecera empresa
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(company?.nombre ?? 'Empresa', pageWidth / 2, y, { align: 'center' })
      y += 5
      if (company?.rif) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(`RIF: ${company.rif}`, pageWidth / 2, y, { align: 'center' })
        y += 4
      }
      if (company?.direccion) {
        doc.setFontSize(8)
        doc.text(company.direccion, pageWidth / 2, y, { align: 'center' })
        y += 4
      }
      if (company?.telefono) {
        doc.setFontSize(8)
        doc.text(`Tel: ${company.telefono}`, pageWidth / 2, y, { align: 'center' })
        y += 4
      }

      // Linea separadora
      y += 3
      doc.setDrawColor(59, 130, 246)
      doc.setLineWidth(0.5)
      doc.line(15, y, pageWidth - 15, y)
      y += 7

      // Titulo
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Factura Nro: ${factura.nroFactura}`, pageWidth / 2, y, { align: 'center' })
      y += 8

      // Datos de la factura
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      const infoLeft = [
        `Cliente: ${factura.clienteNombre}`,
        `Identificacion: ${factura.clienteIdentificacion}`,
        `Tipo: ${factura.tipo}`,
      ]
      const infoRight = [
        `Fecha: ${formatDateTime(factura.fecha)}`,
        `Tasa: ${formatTasa(factura.tasa)}`,
        `Status: ${factura.status.toUpperCase()}`,
      ]
      infoLeft.forEach((txt) => { doc.text(txt, 15, y); y += 5 })
      y -= 15
      infoRight.forEach((txt) => { doc.text(txt, pageWidth / 2 + 10, y); y += 5 })
      y += 5

      // Tabla de articulos
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Articulos', 15, y)
      y += 4

      const artBody = detalles.map((d) => {
        const cant = parseFloat(d.cantidad)
        const precio = parseFloat(d.precio_unitario_usd)
        return [d.producto_codigo, d.producto_nombre, String(cant), fmtUsdPlain(precio), fmtUsdPlain(cant * precio)]
      })

      autoTable(doc, {
        startY: y,
        head: [['Codigo', 'Producto', 'Cant.', 'P.Unit', 'Subtotal']],
        body: artBody,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: 15, right: 15 },
      })

      y = (doc as AutoTableDoc).lastAutoTable.finalY + 6

      // Pagos
      if (pagos.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Pagos', 15, y)
        y += 4

        const pagosBody = pagos.map((p) => [
          p.metodo_nombre,
          p.moneda,
          p.moneda === 'BS' ? fmtBsPlain(parseFloat(p.monto)) : fmtUsdPlain(parseFloat(p.monto)),
          fmtUsdPlain(parseFloat(p.monto_usd)),
        ])

        autoTable(doc, {
          startY: y,
          head: [['Metodo', 'Moneda', 'Monto', 'Equiv. USD']],
          body: pagosBody,
          theme: 'grid',
          headStyles: { fillColor: [107, 114, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
          margin: { left: 15, right: 15 },
        })

        y = (doc as AutoTableDoc).lastAutoTable.finalY + 6
      }

      // Totales
      autoTable(doc, {
        startY: y,
        head: [['', '']],
        body: [
          ['Total USD', fmtUsdPlain(factura.totalUsd)],
          ['Total Bs', fmtBsPlain(factura.totalBs)],
          ['Pagado', fmtUsdPlain(totalPagado)],
          ['Saldo Pendiente', fmtUsdPlain(factura.saldoPendUsd)],
        ],
        theme: 'plain',
        headStyles: { fillColor: [255, 255, 255], textColor: [255, 255, 255], fontSize: 1 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { halign: 'right' } },
        margin: { left: pageWidth - 80, right: 15 },
        tableWidth: 65,
      })

      // Pie
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(150)
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.text(
        `Reimpresion generada el ${new Date().toLocaleString('es-VE')}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      )

      doc.save(`factura-${factura.nroFactura}.pdf`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Factura #{factura.nroFactura}</h2>
            <p className="text-xs text-muted-foreground">Detalle completo</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleImprimirPdf} disabled={generandoPdf || isLoading}>
          {generandoPdf ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileDown className="size-4" />
          )}
          Reimprimir PDF
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Info factura */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg border p-3">
            <div>
              <span className="text-muted-foreground text-xs">Cliente</span>
              <p className="font-medium">{factura.clienteNombre}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Identificacion</span>
              <p>{factura.clienteIdentificacion}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Fecha</span>
              <p>{formatDateTime(factura.fecha)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Tipo</span>
              <p className={factura.tipo === 'CREDITO' ? 'text-red-600 font-medium' : ''}>
                {factura.tipo}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Total</span>
              <p className="font-bold">{formatUsd(factura.totalUsd)} / {formatBs(factura.totalBs)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Tasa</span>
              <p>{formatTasa(factura.tasa)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Status</span>
              <p><StatusBadge status={factura.status} /></p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Saldo Pendiente</span>
              <p className={factura.saldoPendUsd > 0.01 ? 'text-amber-600 font-medium' : ''}>
                {formatUsd(factura.saldoPendUsd)}
              </p>
            </div>
          </div>

          {/* Articulos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Articulos ({detalles.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Codigo</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Cant.</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Precio</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d, i) => {
                    const cant = parseFloat(d.cantidad)
                    const precio = parseFloat(d.precio_unitario_usd)
                    return (
                      <tr key={i} className="border-b border-muted">
                        <td className="px-2 py-1.5 font-mono text-xs">{d.producto_codigo}</td>
                        <td className="px-2 py-1.5">{d.producto_nombre}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(cant, cant % 1 === 0 ? 0 : 2)}</td>
                        <td className="px-2 py-1.5 text-right">{formatUsd(precio)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatUsd(cant * precio)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagos */}
          {pagos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pagos ({pagos.length}) &middot; Total: {formatUsd(totalPagado)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Metodo</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Moneda</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Monto</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Equiv. USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p, i) => (
                      <tr key={i} className="border-b border-muted">
                        <td className="px-2 py-1.5">{p.metodo_nombre}</td>
                        <td className="px-2 py-1.5">{p.moneda}</td>
                        <td className="px-2 py-1.5 text-right">
                          {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatUsd(p.monto_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Saldo pendiente */}
          {factura.saldoPendUsd > 0.01 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800">
                Saldo pendiente: {formatUsd(factura.saldoPendUsd)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers compartidos ────────────────────────────────────

interface AutoTableDoc extends jsPDF {
  lastAutoTable: { finalY: number }
}

const fmtUsdPlain = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtBsPlain = (v: number) =>
  `Bs. ${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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

function LoadingSkeleton() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-10 bg-muted rounded animate-pulse" />
      ))}
    </div>
  )
}
