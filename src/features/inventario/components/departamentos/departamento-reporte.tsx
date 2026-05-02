import { useRef, useEffect, useMemo } from 'react'
import { X, Printer, FileArrowDown } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateTime } from '@/lib/format'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import type { DepartamentoConConteo } from '@/features/inventario/hooks/use-departamentos'

interface DepartamentoReporteProps {
  isOpen: boolean
  onClose: () => void
  departamentos: DepartamentoConConteo[]
}

function compareCodigo(a: string, b: string) {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  const aValid = !isNaN(na) && /^\d+$/.test(a)
  const bValid = !isNaN(nb) && /^\d+$/.test(b)
  if (aValid && bValid) return na - nb
  if (aValid) return -1
  if (bValid) return 1
  return a.localeCompare(b)
}

export function DepartamentoReporte({
  isOpen,
  onClose,
  departamentos,
}: DepartamentoReporteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { company } = useCompany()

  const departamentosOrdenados = useMemo(
    () => [...departamentos].sort((a, b) => compareCodigo(a.codigo, b.codigo)),
    [departamentos]
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

  const totalActivos = departamentosOrdenados.filter((d) => d.is_active === 1).length
  const totalInactivos = departamentosOrdenados.filter((d) => d.is_active === 0).length
  const totalArticulos = departamentosOrdenados.reduce(
    (sum, d) => sum + d.articulos_activos,
    0
  )

  function generarPdf(): jsPDF {
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
    doc.text('Reporte de Departamentos', pageWidth / 2, y, { align: 'center' })
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
      `Total: ${departamentosOrdenados.length}  |  Activos: ${totalActivos}  |  Inactivos: ${totalInactivos}  |  Articulos: ${totalArticulos}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    )

    // Tabla
    autoTable(doc, {
      startY: y + 5,
      head: [['#', 'Codigo', 'Nombre', 'Articulos Activos', 'Estado']],
      body: departamentosOrdenados.map((d, i) => [
        String(i + 1),
        d.codigo,
        d.nombre,
        String(d.articulos_activos),
        d.is_active === 1 ? 'Activo' : 'Inactivo',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        0: { halign: 'right', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 25 },
        3: { halign: 'right' },
      },
      theme: 'striped',
    })

    return doc
  }

  function handleDescargarPdf() {
    const doc = generarPdf()
    const fecha = new Date().toISOString().slice(0, 10)
    doc.save(`departamentos_${fecha}.pdf`)
  }

  function handlePrint() {
    const doc = generarPdf()
    doc.autoPrint()
    const blobUrl = doc.output('bloburl')
    window.open(String(blobUrl), '_blank')
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-3xl shadow-xl max-h-[90vh]"
    >
      <div className="flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Reporte de Departamentos</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDescargarPdf}
              disabled={departamentosOrdenados.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <FileArrowDown className="h-4 w-4" />
              Descargar PDF
            </button>
            <button
              onClick={handlePrint}
              disabled={departamentosOrdenados.length === 0}
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

        <div className="flex-1 overflow-y-auto p-6">
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
              Reporte de Departamentos
            </h2>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
            <div className="border rounded-md p-3">
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-lg font-bold">{departamentosOrdenados.length}</p>
            </div>
            <div className="border rounded-md p-3">
              <p className="text-xs text-gray-600">Activos</p>
              <p className="text-lg font-bold text-green-700">{totalActivos}</p>
            </div>
            <div className="border rounded-md p-3">
              <p className="text-xs text-gray-600">Inactivos</p>
              <p className="text-lg font-bold text-red-700">{totalInactivos}</p>
            </div>
            <div className="border rounded-md p-3">
              <p className="text-xs text-gray-600">Articulos Activos</p>
              <p className="text-lg font-bold">{totalArticulos}</p>
            </div>
          </div>

          {/* Tabla */}
          {departamentosOrdenados.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No hay departamentos registrados
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left px-3 py-2 font-semibold">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Codigo</th>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-right px-3 py-2 font-semibold">
                    Articulos Activos
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {departamentosOrdenados.map((dep, i) => (
                  <tr key={dep.id} className="border-b border-gray-200">
                    <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">{dep.codigo}</td>
                    <td className="px-3 py-2">{dep.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {dep.articulos_activos}
                    </td>
                    <td className="px-3 py-2">
                      {dep.is_active === 1 ? 'Activo' : 'Inactivo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </dialog>
  )
}
