import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatDate } from '@/lib/format'
import {
  useProductosPorDepartamento,
  type Departamento,
} from '@/features/inventario/hooks/use-departamentos'

interface DepartamentoArticulosModalProps {
  isOpen: boolean
  onClose: () => void
  departamento: Departamento | null
}

export function DepartamentoArticulosModal({
  isOpen,
  onClose,
  departamento,
}: DepartamentoArticulosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos, isLoading } = useProductosPorDepartamento(
    departamento?.id ?? null
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl max-h-[85vh]"
    >
      <div className="p-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Articulos del Departamento</h2>
            {departamento && (
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{departamento.codigo}</span>
                {' - '}
                {departamento.nombre}
                {' - '}
                {productos.length} articulo(s)
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : productos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex-1">
            <p className="text-sm">
              Este departamento no tiene articulos asociados
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="overflow-y-auto border rounded-lg flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Codigo</th>
                    <th className="text-left px-3 py-2 font-medium">Nombre</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                    <th className="text-left px-3 py-2 font-medium">
                      Fecha de Creacion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.id} className="border-b border-muted">
                      <td className="px-3 py-2 font-mono text-xs text-gray-900">
                        {p.codigo}
                      </td>
                      <td className="px-3 py-2 text-gray-900">{p.nombre}</td>
                      <td className="px-3 py-2">
                        {p.is_active === 1 ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(p.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
