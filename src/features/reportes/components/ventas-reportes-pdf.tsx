import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { formatDate } from '@/lib/format'
import {
  useVentasKpisRango,
  usePagosPorMetodoRango,
  useDevolucionesRango,
  useFacturasReporte,
  useDetalleFacturasReporte,
} from '../hooks/use-ventas-reportes'
import type {
  MetodoPagoResumen,
  FacturaReporte,
  DetalleFacturaReporte,
} from '../hooks/use-ventas-reportes'

interface VentasReportesPdfProps {
  fechaDesde: string
  fechaHasta: string
}

interface AutoTableDoc extends jsPDF {
  lastAutoTable: { finalY: number }
}

function getFinalY(doc: jsPDF): number {
  return (doc as AutoTableDoc).lastAutoTable.finalY
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - 15) {
    doc.addPage()
    return 15
  }
  return y
}

const fmtUsd = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtBs = (v: number) =>
  `Bs. ${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function VentasReportesPdfButton({ fechaDesde, fechaHasta }: VentasReportesPdfProps) {
  const [open, setOpen] = useState(false)
  const [incluirFacturas, setIncluirFacturas] = useState(false)
  const [incluirArticulos, setIncluirArticulos] = useState(false)
  const [generando, setGenerando] = useState(false)

  const { company } = useCompany()
  const { totalVentasUsd, totalVentasBs, facturasCount } = useVentasKpisRango(fechaDesde, fechaHasta)
  const { metodos } = usePagosPorMetodoRango(fechaDesde, fechaHasta)
  const { devoluciones } = useDevolucionesRango(fechaDesde, fechaHasta)
  const { facturas } = useFacturasReporte(fechaDesde, fechaHasta)
  const { detalles } = useDetalleFacturasReporte(fechaDesde, fechaHasta)

  function handleGenerar() {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 15

      // ─── Cabecera empresa ──────────────────────────
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(company?.nombre ?? 'Empresa', pageWidth / 2, y, { align: 'center' })
      y += 6

      if (company?.rif) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text(`RIF: ${company.rif}`, pageWidth / 2, y, { align: 'center' })
        y += 5
      }

      if (company?.direccion) {
        doc.setFontSize(8)
        doc.text(company.direccion, pageWidth / 2, y, { align: 'center' })
        y += 5
      }

      if (company?.telefono) {
        doc.setFontSize(8)
        doc.text(`Tel: ${company.telefono}`, pageWidth / 2, y, { align: 'center' })
        y += 5
      }

      // ─── Titulo del reporte ────────────────────────
      y += 3
      doc.setDrawColor(59, 130, 246)
      doc.setLineWidth(0.5)
      doc.line(15, y, pageWidth - 15, y)
      y += 7

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Reporte de Ventas', pageWidth / 2, y, { align: 'center' })
      y += 6

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Periodo: ${formatDate(fechaDesde + 'T00:00:00')} al ${formatDate(fechaHasta + 'T00:00:00')}`,
        pageWidth / 2,
        y,
        { align: 'center' }
      )
      y += 10

      // ─── Resumen de ventas ─────────────────────────
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Resumen de Ventas', 15, y)
      y += 6

      autoTable(doc, {
        startY: y,
        head: [['Concepto', 'Valor']],
        body: [
          ['Total Ventas (USD)', fmtUsd(totalVentasUsd)],
          ['Total Ventas (Bs)', fmtBs(totalVentasBs)],
          ['Facturas Emitidas', String(facturasCount)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        margin: { left: 15, right: 15 },
        tableWidth: 'auto',
      })

      y = getFinalY(doc) + 10

      // ─── Cobros por metodo de pago ─────────────────
      if (metodos.length > 0) {
        y = checkPageBreak(doc, y, 30)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Recibido por Metodo de Pago', 15, y)
        y += 6

        const pagosBody = metodos.map((m: MetodoPagoResumen) => [
          m.nombre,
          m.moneda,
          m.moneda === 'BS' ? fmtBs(m.totalOriginal) : fmtUsd(m.totalOriginal),
          fmtUsd(m.totalUsd),
        ])

        const totalPagosUsd = metodos.reduce((s, m) => s + m.totalUsd, 0)
        pagosBody.push(['TOTAL', '', '', fmtUsd(totalPagosUsd)])

        autoTable(doc, {
          startY: y,
          head: [['Metodo', 'Moneda', 'Monto Original', 'Equiv. USD']],
          body: pagosBody,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
          },
          margin: { left: 15, right: 15 },
          didParseCell: (data) => {
            if (data.row.index === pagosBody.length - 1 && data.section === 'body') {
              data.cell.styles.fontStyle = 'bold'
            }
          },
        })

        y = getFinalY(doc) + 10
      }

      // ─── Devoluciones ──────────────────────────────
      y = checkPageBreak(doc, y, 25)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Devoluciones (Notas de Credito)', 15, y)
      y += 6

      const devBody =
        devoluciones.cantidad === 0
          ? [['Sin devoluciones en el periodo', '-']]
          : [
              ['Cantidad de Notas de Credito', String(devoluciones.cantidad)],
              ['Total Devoluciones (USD)', fmtUsd(devoluciones.totalUsd)],
              ['Total Devoluciones (Bs)', fmtBs(devoluciones.totalBs)],
            ]

      autoTable(doc, {
        startY: y,
        head: [['Concepto', 'Valor']],
        body: devBody,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        margin: { left: 15, right: 15 },
        tableWidth: 'auto',
      })

      y = getFinalY(doc) + 10

      // ─── Facturas del periodo (opcional) ───────────
      if (incluirFacturas && facturas.length > 0) {
        y = checkPageBreak(doc, y, 30)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Listado de Facturas del Periodo', 15, y)
        y += 6

        const facturasBody = facturas.map((f: FacturaReporte) => [
          f.nroFactura,
          formatDate(f.fecha + (f.fecha.includes('T') ? '' : 'T00:00:00')),
          f.clienteNombre,
          fmtUsd(f.totalUsd),
          fmtBs(f.totalBs),
          f.status.toUpperCase(),
        ])

        autoTable(doc, {
          startY: y,
          head: [['Nro Factura', 'Fecha', 'Cliente', 'Total USD', 'Total Bs', 'Status']],
          body: facturasBody,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 22 },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'center', cellWidth: 18 },
          },
          margin: { left: 15, right: 15 },
        })

        y = getFinalY(doc) + 10
      }

      // ─── Articulos vendidos por factura (opcional) ─
      if (incluirArticulos && detalles.length > 0) {
        const detallesByFactura = new Map<string, DetalleFacturaReporte[]>()
        for (const d of detalles) {
          const list = detallesByFactura.get(d.nroFactura) ?? []
          list.push(d)
          detallesByFactura.set(d.nroFactura, list)
        }

        y = checkPageBreak(doc, y, 30)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Articulos Vendidos por Factura', 15, y)
        y += 6

        for (const [nroFactura, items] of detallesByFactura) {
          y = checkPageBreak(doc, y, 20)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.text(`Factura: ${nroFactura}`, 15, y)
          y += 4

          const artBody = items.map((d) => [
            d.productoCodigo,
            d.productoNombre,
            d.cantidad.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
            fmtUsd(d.precioUnitario),
            fmtUsd(d.subtotal),
          ])

          const subtotalFactura = items.reduce((s, d) => s + d.subtotal, 0)
          artBody.push(['', 'SUBTOTAL', '', '', fmtUsd(subtotalFactura)])

          autoTable(doc, {
            startY: y,
            head: [['Codigo', 'Producto', 'Cant.', 'P.Unit', 'Subtotal']],
            body: artBody,
            theme: 'grid',
            headStyles: { fillColor: [107, 114, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
              2: { halign: 'right' },
              3: { halign: 'right' },
              4: { halign: 'right' },
            },
            margin: { left: 20, right: 15 },
            didParseCell: (data) => {
              if (data.row.index === artBody.length - 1 && data.section === 'body') {
                data.cell.styles.fontStyle = 'bold'
              }
            },
          })

          y = getFinalY(doc) + 6
        }
      }

      // ─── Pie de pagina ─────────────────────────────
      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(150)
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.text(
          `Generado el ${new Date().toLocaleString('es-VE')} - Pagina ${i} de ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        )
        doc.setTextColor(0)
      }

      doc.save(`reporte-ventas-${fechaDesde}-${fechaHasta}.pdf`)
      setOpen(false)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileDown className="size-4" />
        Generar PDF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar Reporte PDF</DialogTitle>
            <DialogDescription>
              Periodo: {fechaDesde} al {fechaHasta}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              El reporte incluira: datos de la empresa, total de ventas en USD y Bs,
              recibido por metodo de pago, y total de devoluciones.
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={incluirFacturas}
                  onCheckedChange={(v) => setIncluirFacturas(v === true)}
                />
                <div>
                  <p className="text-sm font-medium">Incluir listado de facturas</p>
                  <p className="text-xs text-muted-foreground">
                    Nro factura, cliente, monto en USD y Bs
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={incluirArticulos}
                  onCheckedChange={(v) => setIncluirArticulos(v === true)}
                />
                <div>
                  <p className="text-sm font-medium">Incluir articulos por factura</p>
                  <p className="text-xs text-muted-foreground">
                    Detalle de productos vendidos en cada factura
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={generando}>
              Cancelar
            </Button>
            <Button onClick={handleGenerar} disabled={generando}>
              {generando ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FileDown className="size-4" />
                  Generar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
