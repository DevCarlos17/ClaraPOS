import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  sesionCajaAperturaSchema,
  sesionCajaCierreSchema,
} from '@/features/caja/schemas/sesion-caja-schema'
import {
  abrirSesionCaja,
  cerrarSesionCaja,
} from '@/features/caja/hooks/use-sesiones-caja'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Props ────────────────────────────────────────────────────

interface SesionCajaFormProps {
  mode: 'apertura' | 'cierre'
  isOpen: boolean
  onClose: () => void
  sesionId?: string
}

// ─── Formulario de apertura ───────────────────────────────────

function FormApertura({ onClose }: { onClose: () => void }) {
  const { user } = useCurrentUser()
  const { cajas, isLoading: loadingCajas } = useCajasActivas()

  const [cajaId, setCajaId] = useState('')
  const [montoApertura, setMontoApertura] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function resetFields() {
    setCajaId('')
    setMontoApertura('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = sesionCajaAperturaSchema.safeParse({
      caja_id: cajaId,
      monto_apertura_usd: parseFloat(montoApertura) || 0,
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

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    setSubmitting(true)
    try {
      await abrirSesionCaja({
        caja_id: parsed.data.caja_id,
        monto_apertura_usd: parsed.data.monto_apertura_usd,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })
      toast.success('Sesion de caja abierta exitosamente')
      resetFields()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Caja */}
      <div>
        <label htmlFor="apertura-caja" className="block text-sm font-medium text-gray-700 mb-1">
          Caja
        </label>
        <select
          id="apertura-caja"
          value={cajaId}
          onChange={(e) => setCajaId(e.target.value)}
          disabled={loadingCajas}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.caja_id ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value="">
            {loadingCajas ? 'Cargando cajas...' : 'Seleccionar caja'}
          </option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {errors.caja_id && (
          <p className="text-red-500 text-xs mt-1">{errors.caja_id}</p>
        )}
      </div>

      {/* Monto de apertura */}
      <div>
        <label htmlFor="apertura-monto" className="block text-sm font-medium text-gray-700 mb-1">
          Monto de Apertura (USD)
        </label>
        <input
          id="apertura-monto"
          type="number"
          step="0.01"
          min="0"
          value={montoApertura}
          onChange={(e) => setMontoApertura(e.target.value)}
          placeholder="0.00"
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.monto_apertura_usd ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.monto_apertura_usd && (
          <p className="text-red-500 text-xs mt-1">{errors.monto_apertura_usd}</p>
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
          {submitting ? 'Abriendo...' : 'Abrir Sesion'}
        </button>
      </div>
    </form>
  )
}

// ─── Formulario de cierre ─────────────────────────────────────

function FormCierre({
  sesionId,
  onClose,
}: {
  sesionId: string
  onClose: () => void
}) {
  const { user } = useCurrentUser()

  const [montoFisico, setMontoFisico] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function resetFields() {
    setMontoFisico('')
    setObservaciones('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = sesionCajaCierreSchema.safeParse({
      monto_fisico_usd: parseFloat(montoFisico) || 0,
      observaciones_cierre: observaciones.trim() || undefined,
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

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    setSubmitting(true)
    try {
      await cerrarSesionCaja(sesionId, {
        monto_fisico_usd: parsed.data.monto_fisico_usd,
        observaciones_cierre: parsed.data.observaciones_cierre,
        usuario_cierre_id: user.id,
      })
      toast.success('Sesion de caja cerrada exitosamente')
      resetFields()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Monto fisico */}
      <div>
        <label htmlFor="cierre-monto" className="block text-sm font-medium text-gray-700 mb-1">
          Monto Fisico en Caja (USD)
        </label>
        <input
          id="cierre-monto"
          type="number"
          step="0.01"
          min="0"
          value={montoFisico}
          onChange={(e) => setMontoFisico(e.target.value)}
          placeholder="0.00"
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.monto_fisico_usd ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.monto_fisico_usd && (
          <p className="text-red-500 text-xs mt-1">{errors.monto_fisico_usd}</p>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <label htmlFor="cierre-obs" className="block text-sm font-medium text-gray-700 mb-1">
          Observaciones <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          id="cierre-obs"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Notas sobre el cierre..."
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
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
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Cerrando...' : 'Cerrar Sesion'}
        </button>
      </div>
    </form>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaForm({ mode, isOpen, onClose, sesionId }: SesionCajaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  const titulo = mode === 'apertura' ? 'Abrir Sesion de Caja' : 'Cerrar Sesion de Caja'

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">{titulo}</h2>

        {mode === 'apertura' ? (
          <FormApertura onClose={onClose} />
        ) : (
          sesionId && <FormCierre sesionId={sesionId} onClose={onClose} />
        )}
      </div>
    </dialog>
  )
}
