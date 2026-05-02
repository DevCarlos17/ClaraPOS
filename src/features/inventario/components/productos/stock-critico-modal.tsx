import { useRef, useEffect } from 'react'
import { X, Printer, FileArrowDown } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateTime } from '@/lib/format'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'

interface StockCriticoModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  departamentos: Departamento[]
}

export function StockCriticoModal({
  isOpen,
  onClose,
  productos,
  departamentos,
}: StockCriticoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { company } = useCompany()

  const depMap = new Map<string, string>()
  for (const d of departamentos) depMap.set(d.id, d.nombre)

  const productosCriticos = productos.filter(
    (p) =>
      p.tipo === 'P' &&
      p.is_active === 1 &&
      parseFloat(p.stock_minimo) > 0 &&
      parseFloat(p.stock) < parseFloat(p.stock_minimo)
  )

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function handlePrint() {
    window.print()
  }

  function handleDescargarPdf() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Cabecera empresa
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.nombre ?? 'Empresa', pageWidth / 2, 15, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    let y = 20
    if (company?.rif) {
      doc.text(`RIF: ${company.rif}`, pageWidth / 2, y, { align: 'center' })
      y += 4
    }
    if (company?.direccion) {
      doc.text(company.direccion, pageWidth / 2, y, { align: 'center' })
      y += 4
    }
    if (company?.telefono) {
      doc.text(`Tel: ${company.telefono}`, pageWidth / 2, y, { align: 'center' })
      y += 4
    }

    y += 4
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Reporte de Productos con Stock Critico', pageWidth / 2, y, {
      align: 'center',
    })
    y += 5

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Generado: ${formatDateTime(new Date().toISOString())}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    )
    y += 3
    doc.text(
      `Total de productos criticos: ${productosCriticos.length}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    )

    // Tabla
    autoTable(doc, {
      startY: y + 5,
      head: [
        ['Codigo', 'Nombre', 'Departamento', 'Stock Actual', 'Stock Minimo', 'Faltante'],
      ],
      body: productosCriticos.map((p) => {
        const stock = parseFloat(p.stock)
        const minimo = parseFloat(p.stock_minimo)
        const faltante = Math.max(0, minimo - stock)
        return [
          p.codigo,
          p.nombre,
          depMap.get(p.departamento_id) ?? '-',
          stock.toFixed(3),
          minimo.toFixed(3),
          faltante.toFixed(3),
        ]
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      theme: 'striped',
    })

    const fecha = new Date().toISOString().slice(0, 10)
    doc.save(`stock_critico_${fecha}.pdf`)
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl max-h-[90vh] print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
    >
      <div className="flex flex-col max-h-[90vh] print:max-h-none">
        {/* Header (oculto en impresion) */}
        <div className="flex items-center justify-between p-4 border-b shrink-0 print:hidden">
          <h2 className="text-lg font-semibold">Productos con Stock Critico</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDescargarPdf}
              disabled={productosCriticos.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <FileArrowDown className="h-4 w-4" />
              Descargar PDF
            </button>
            <button
              onClick={handlePrint}
              disabled={productosCriticos.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Contenido imprimible */}
        <div
          id="stock-critico-print"
          className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0"
        >
          {/* Cabecera del reporte */}
          <div className="mb-6 pb-4 border-b-2 border-gray-900">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {company?.nombre ?? 'Empresa'}
                </h1>
                {company?.rif && (
                  <p className="text-xs text-gray-600">RIF: {company.rif}</p>
                )}
                {company?.direccion && (
                  <p className="text-xs text-gray-600">{company.direccion}</p>
                )}
                {company?.telefono && (
                  <p className="text-xs text-gray-600">Tel: {company.telefono}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600">
                  Generado: {formatDateTime(new Date().toISOString())}
                </p>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mt-4 text-center">
              Reporte de Productos con Stock Critico
            </h2>
            <p className="text-xs text-gray-600 text-center mt-1">
              Total: {productosCriticos.length} producto(s) bajos en inventario
            </p>
          </div>

          {productosCriticos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">No hay productos con stock critico</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left px-3 py-2 font-semibold">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Codigo</th>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold">Departamento</th>
                  <th className="text-right px-3 py-2 font-semibold">Stock</th>
                  <th className="text-right px-3 py-2 font-semibold">Minimo</th>
                  <th className="text-right px-3 py-2 font-semibold">Faltante</th>
                </tr>
              </thead>
              <tbody>
                {productosCriticos.map((p, i) => {
                  const stock = parseFloat(p.stock)
                  const minimo = parseFloat(p.stock_minimo)
                  const faltante = Math.max(0, minimo - stock)
                  const dec = 3
                  return (
                    <tr key={p.id} className="border-b border-gray-200">
                      <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                      <td className="px-3 py-2 font-mono">{p.codigo}</td>
                      <td className="px-3 py-2">{p.nombre}</td>
                      <td className="px-3 py-2">
                        {depMap.get(p.departamento_id) ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600 font-medium">
                        {stock.toFixed(dec)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {minimo.toFixed(dec)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {faltante.toFixed(dec)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #stock-critico-print,
          #stock-critico-print * {
            visibility: visible;
          }
          #stock-critico-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 1.5cm;
          }
        }
      `}</style>
    </dialog>
  )
}
