import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { plantillaSchema } from '@/features/inventario/schemas/plantilla-schema'
import {
  crearPlantilla,
  actualizarPlantilla,
  usePlantillaProductos,
  type PlantillaConProductos,
} from '@/features/inventario/hooks/use-plantillas-traspaso'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface PlantillaFormProps {
  isOpen: boolean
  onClose: () => void
  plantilla?: PlantillaConProductos
}

export function PlantillaForm({ isOpen, onClose, plantilla }: PlantillaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!plantilla
  const { user } = useCurrentUser()
  const { productos } = useProductos()
  const { productos: productosPlantilla } = usePlantillaProductos(plantilla?.id ?? '')

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [productoIds, setProductoIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNombre(plantilla?.nombre ?? '')
      setDescripcion(plantilla?.descripcion ?? '')
      setQuery('')
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, plantilla])

  // Precarga de productoIds al editar — corre por separado del reset de
  // nombre/descripcion para poder actualizar cuando `usePlantillaProductos`
  // resuelve su fetch lazy (llega despues del primer render si aun esta cargando).
  useEffect(() => {
    if (!isOpen) return
    if (plantilla) {
      setProductoIds(productosPlantilla.map((p) => p.producto_id))
    } else {
      setProductoIds([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plantilla?.id, productosPlantilla])

  const productosActivos = useMemo(
    () => productos.filter((p) => p.tipo === 'P' && p.is_active === 1),
    [productos]
  )

  const productosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return productosActivos
    return productosActivos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    )
  }, [productosActivos, query])

  function toggleProducto(id: string) {
    setProductoIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = plantillaSchema.safeParse({
      nombre,
      descripcion: descripcion || undefined,
      productoIds,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && plantilla) {
        await actualizarPlantilla(plantilla.id, {
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion,
          productoIds: parsed.data.productoIds,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Plantilla actualizada correctamente')
      } else {
        await crearPlantilla({
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion,
          empresa_id: user!.empresa_id!,
          productoIds: parsed.data.productoIds,
        })
        toast.success('Plantilla creada correctamente')
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Plantilla' : 'Nueva Plantilla'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="plantilla-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="plantilla-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: REPOSICION MOSTRADOR"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Descripcion */}
          <div>
            <label htmlFor="plantilla-descripcion" className="block text-sm font-medium text-gray-700 mb-1">
              Descripcion <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="plantilla-descripcion"
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripcion de la plantilla"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.descripcion ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.descripcion && (
              <p className="text-red-500 text-xs mt-1">{errors.descripcion}</p>
            )}
          </div>

          {/* Productos */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Productos</label>
              <span className="text-xs text-muted-foreground">{productoIds.length} seleccionado(s)</span>
            </div>
            <div className="relative mb-2">
              <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto por nombre o codigo"
                className="w-full h-8 pl-6 pr-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div
              className={`max-h-48 overflow-y-auto border rounded-md divide-y divide-border ${
                errors.productoIds ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              {productosFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin productos que coincidan
                </p>
              ) : (
                productosFiltrados.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={productoIds.includes(p.id)}
                      onChange={() => toggleProducto(p.id)}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                    <span className="truncate">{p.nombre}</span>
                  </label>
                ))
              )}
            </div>
            {errors.productoIds && (
              <p className="text-red-500 text-xs mt-1">{errors.productoIds}</p>
            )}
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
