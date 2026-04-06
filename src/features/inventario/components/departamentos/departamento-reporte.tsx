import { useRef, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import type { DepartamentoConConteo } from '@/features/inventario/hooks/use-departamentos'

interface DepartamentoReporteProps {
  isOpen: boolean
  onClose: () => void
  departamentos: DepartamentoConConteo[]
}

export function DepartamentoReporte({
  isOpen,
  onClose,
  departamentos,
}: DepartamentoReporteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { company } = useCompany()

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

  const totalActivos = departamentos.filter((d) => d.activo === 1).length
  const totalInactivos = departamentos.filter((d) => d.activo === 0).length
  const totalArticulos = departamentos.reduce(
    (sum, d) => sum + d.articulos_activos,
    0
  )

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-3xl shadow-xl max-h-[90vh] print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
    >
      <div className="flex flex-col max-h-[90vh] print:max-h-none">
        {/* Header (se oculta en impresion) */}
        <div className="flex items-center justify-between p-4 border-b shrink-0 print:hidden">
          <h2 className="text-lg font-semibold">Reporte de Departamentos</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
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
          id="reporte-departamentos-print"
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
              <p className="text-lg font-bold">{departamentos.length}</p>
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
              {departamentos.map((dep, i) => (
                <tr key={dep.id} className="border-b border-gray-200">
                  <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{dep.codigo}</td>
                  <td className="px-3 py-2">{dep.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {dep.articulos_activos}
                  </td>
                  <td className="px-3 py-2">
                    {dep.activo === 1 ? 'Activo' : 'Inactivo'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {departamentos.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No hay departamentos registrados
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #reporte-departamentos-print,
          #reporte-departamentos-print * {
            visibility: visible;
          }
          #reporte-departamentos-print {
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
