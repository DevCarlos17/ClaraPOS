import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useImportLog, type ImportLogEntry } from '@/features/inventario/hooks/use-import-log'
import { formatDateTime } from '@/lib/format'
import { ImportLogDetalleModal } from './import-log-detalle-modal'

interface ImportLogListProps {
  isOpen: boolean
  onClose: () => void
}

const MODO_LABELS: Record<string, string> = {
  crear: 'Solo agregar',
  actualizar: 'Solo actualizar',
  upsert: 'Agregar y actualizar',
}

export function ImportLogList({ isOpen, onClose }: ImportLogListProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { entries, isLoading, error, refetch } = useImportLog()
  const [selectedEntry, setSelectedEntry] = useState<ImportLogEntry | null>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      refetch()
    } else {
      dialogRef.current?.close()
      setSelectedEntry(null)
    }
  }, [isOpen, refetch])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
      >
        <div className="p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Historial de Importaciones</h2>
            <span className="text-xs text-gray-500">{entries.length} registro(s)</span>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">No hay registros de importacion</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Usuario</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Modo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Archivo</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Creados</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Actualizados</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Omitidos</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-100 ${
                        entry.filas_error > 0 ? 'bg-amber-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDateTime(entry.fecha)}</td>
                      <td className="px-3 py-2 text-gray-700">{entry.usuario_nombre ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{MODO_LABELS[entry.modo] ?? entry.modo}</td>
                      <td className="px-3 py-2 text-gray-500">{entry.archivo_nombre ?? '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{entry.filas_creadas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{entry.filas_actualizadas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{entry.filas_omitidas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{entry.filas_error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </dialog>

      <ImportLogDetalleModal
        isOpen={selectedEntry !== null}
        onClose={() => setSelectedEntry(null)}
        entry={selectedEntry}
      />
    </>
  )
}
