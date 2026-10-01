import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  fetchImportLogDet,
  type ImportLogDetEntry,
  type ImportLogEntry,
} from '@/features/inventario/hooks/use-import-log'
import { formatDateTime } from '@/lib/format'

interface ImportLogDetalleModalProps {
  isOpen: boolean
  onClose: () => void
  entry: ImportLogEntry | null
}

const MODO_LABELS: Record<string, string> = {
  crear: 'Solo agregar',
  actualizar: 'Solo actualizar',
  upsert: 'Agregar y actualizar',
}

function AccionBadge({ accion }: { accion: string }) {
  switch (accion) {
    case 'CREAR':
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
          CREAR
        </span>
      )
    case 'ACTUALIZAR':
      return (
        <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-600/20 ring-inset">
          ACTUALIZAR
        </span>
      )
    case 'ERROR':
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
          ERROR
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
          OMITIR
        </span>
      )
  }
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function CambiosCell({ det }: { det: ImportLogDetEntry }) {
  if (det.accion === 'OMITIR' || det.accion === 'ERROR') {
    return <span className="text-gray-400">-</span>
  }

  const nuevos = parseJson(det.valores_nuevos)
  if (!nuevos) return <span className="text-gray-400">-</span>

  const anteriores = det.accion === 'ACTUALIZAR' ? parseJson(det.valores_anteriores) : null

  return (
    <div className="space-y-0.5">
      {Object.entries(nuevos).map(([campo, valorNuevo]) => {
        const valorAnterior = anteriores?.[campo]
        return (
          <div key={campo} className="text-xs">
            <span className="text-gray-500">{campo}:</span>{' '}
            {det.accion === 'ACTUALIZAR' && anteriores ? (
              <>
                <span className="text-gray-400 line-through">{String(valorAnterior ?? '-')}</span>
                <span className="mx-1 text-gray-400">→</span>
                <span className="font-medium text-gray-900">{String(valorNuevo)}</span>
              </>
            ) : (
              <span className="font-medium text-gray-900">{String(valorNuevo)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ErroresCell({ raw }: { raw: string | null }) {
  if (!raw) return <span className="text-gray-400">-</span>
  try {
    const errores = JSON.parse(raw) as string[]
    return (
      <div className="space-y-0.5">
        {errores.map((e, i) => (
          <div key={i} className="text-xs text-red-600">{e}</div>
        ))}
      </div>
    )
  } catch {
    return <span className="text-gray-400">-</span>
  }
}

export function ImportLogDetalleModal({ isOpen, onClose, entry }: ImportLogDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [detalles, setDetalles] = useState<ImportLogDetEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !entry) return
    let cancelled = false
    setIsLoading(true)
    fetchImportLogDet(entry.id)
      .then((rows) => {
        if (!cancelled) setDetalles(rows)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, entry])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Detalle de Importacion</h2>
            {entry && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                <span>Fecha: {formatDateTime(entry.fecha)}</span>
                <span>Usuario: {entry.usuario_nombre ?? '-'}</span>
                <span>Modo: {MODO_LABELS[entry.modo] ?? entry.modo}</span>
                {entry.archivo_nombre && <span>Archivo: {entry.archivo_nombre}</span>}
              </div>
            )}
          </div>
          {entry && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                {entry.filas_creadas} creados
              </span>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-600/20 ring-inset">
                {entry.filas_actualizadas} actualizados
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                {entry.filas_omitidas} omitidos
              </span>
              {entry.filas_error > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                  {entry.filas_error} errores
                </span>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        ) : detalles.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Sin detalle de filas</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Fila</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Accion</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Codigo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Nombre</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Antes / Despues</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Errores</th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((det) => (
                  <tr key={det.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{det.fila_num}</td>
                    <td className="px-3 py-2"><AccionBadge accion={det.accion} /></td>
                    <td className="px-3 py-2 font-mono text-gray-700">{det.codigo ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-900">{det.nombre ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-500">{det.tipo ?? '-'}</td>
                    <td className="px-3 py-2"><CambiosCell det={det} /></td>
                    <td className="px-3 py-2"><ErroresCell raw={det.errores} /></td>
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
  )
}
