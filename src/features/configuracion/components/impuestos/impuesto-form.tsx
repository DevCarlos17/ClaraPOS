import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { impuestoSchema } from '@/features/configuracion/schemas/impuesto-schema'
import {
  crearImpuesto,
  actualizarImpuesto,
  type Impuesto,
} from '@/features/configuracion/hooks/use-impuestos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface ImpuestoFormProps {
  isOpen: boolean
  onClose: () => void
  impuesto?: Impuesto
}

export function ImpuestoForm({ isOpen, onClose, impuesto }: ImpuestoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!impuesto
  const { user } = useCurrentUser()

  const [nombre, setNombre] = useState('')
  const [tipoTributo, setTipoTributo] = useState<'IVA' | 'IGTF'>('IVA')
  const [porcentaje, setPorcentaje] = useState('')
  const [codigoSeniat, setCodigoSeniat] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (impuesto) {
        setNombre(impuesto.nombre)
        setTipoTributo(impuesto.tipo_tributo as 'IVA' | 'IGTF')
        setPorcentaje(impuesto.porcentaje)
        setCodigoSeniat(impuesto.codigo_seniat ?? '')
        setDescripcion(impuesto.descripcion ?? '')
        setActivo(impuesto.is_active === 1)
      } else {
        setNombre('')
        setTipoTributo('IVA')
        setPorcentaje('')
        setCodigoSeniat('')
        setDescripcion('')
        setActivo(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, impuesto])

  function handleNombreChange(value: string) {
    setNombre(value.toUpperCase())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = impuestoSchema.safeParse({
      nombre,
      tipo_tributo: tipoTributo,
      // porcentaje field expects number; parse from string state before validation
      porcentaje: parseFloat(porcentaje),
      codigo_seniat: codigoSeniat || undefined,
      descripcion: descripcion || undefined,
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
      if (isEditing && impuesto) {
        await actualizarImpuesto(impuesto.id, {
          nombre: parsed.data.nombre,
          tipo_tributo: parsed.data.tipo_tributo,
          porcentaje: parsed.data.porcentaje,
          codigo_seniat: parsed.data.codigo_seniat,
          descripcion: parsed.data.descripcion,
          is_active: activo,
        })
        toast.success('Impuesto actualizado correctamente')
      } else {
        await crearImpuesto({
          nombre: parsed.data.nombre,
          tipo_tributo: parsed.data.tipo_tributo,
          porcentaje: parsed.data.porcentaje,
          codigo_seniat: parsed.data.codigo_seniat,
          descripcion: parsed.data.descripcion,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Impuesto creado correctamente')
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Impuesto' : 'Nuevo Impuesto'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="imp-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="imp-nombre"
              type="text"
              value={nombre}
              onChange={(e) => handleNombreChange(e.target.value)}
              placeholder="Ej: IVA 16%"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Tipo de tributo */}
          <div>
            <label htmlFor="imp-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de tributo
            </label>
            <select
              id="imp-tipo"
              value={tipoTributo}
              onChange={(e) => setTipoTributo(e.target.value as 'IVA' | 'IGTF')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.tipo_tributo ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="IVA">IVA - Impuesto al Valor Agregado</option>
              <option value="IGTF">IGTF - Impuesto a las Grandes Transacciones Financieras</option>
            </select>
            {errors.tipo_tributo && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo_tributo}</p>
            )}
          </div>

          {/* Porcentaje */}
          <div>
            <label htmlFor="imp-porcentaje" className="block text-sm font-medium text-gray-700 mb-1">
              Porcentaje (%)
            </label>
            <input
              id="imp-porcentaje"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              placeholder="Ej: 16.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.porcentaje ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.porcentaje && (
              <p className="text-red-500 text-xs mt-1">{errors.porcentaje}</p>
            )}
          </div>

          {/* Codigo SENIAT */}
          <div>
            <label htmlFor="imp-codigo" className="block text-sm font-medium text-gray-700 mb-1">
              Codigo SENIAT <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="imp-codigo"
              type="text"
              value={codigoSeniat}
              onChange={(e) => setCodigoSeniat(e.target.value)}
              placeholder="Ej: IVA-16"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.codigo_seniat ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.codigo_seniat && (
              <p className="text-red-500 text-xs mt-1">{errors.codigo_seniat}</p>
            )}
          </div>

          {/* Descripcion */}
          <div>
            <label htmlFor="imp-descripcion" className="block text-sm font-medium text-gray-700 mb-1">
              Descripcion <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="imp-descripcion"
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripcion del impuesto"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.descripcion ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.descripcion && (
              <p className="text-red-500 text-xs mt-1">{errors.descripcion}</p>
            )}
          </div>

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              id="imp-activo"
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="imp-activo" className="text-sm font-medium text-gray-700">
              Activo
            </label>
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
