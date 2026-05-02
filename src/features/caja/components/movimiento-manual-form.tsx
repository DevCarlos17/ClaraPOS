import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@powersync/react'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { createMovimientoManual } from '@/features/caja/hooks/use-movimientos-manual'
import {
  movimientoManualSchema,
  ORIGEN_LABELS,
  tipoDeOrigen,
  type OrigenManual,
} from '@/features/caja/schemas/movimiento-manual-schema'
import { NativeSelect } from '@/components/ui/native-select'

// ─── Props ────────────────────────────────────────────────────

interface MovimientoManualFormProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId: string
  origenInicial?: OrigenManual
}

// ─── Opciones de origen ───────────────────────────────────────

const ORIGENES: OrigenManual[] = [
  'INGRESO_MANUAL',
  'EGRESO_MANUAL',
  'AVANCE',
  'PRESTAMO',
]

// Solo metodos EFECTIVO para avance/prestamo
const ORIGENES_SOLO_EFECTIVO: OrigenManual[] = ['AVANCE', 'PRESTAMO']

// ─── Componente de formulario ─────────────────────────────────

function FormMovimientoManual({
  onClose,
  sesionCajaId,
  origenInicial,
}: {
  onClose: () => void
  sesionCajaId: string
  origenInicial: OrigenManual
}) {
  const { user } = useCurrentUser()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()

  const [origen, setOrigen] = useState<OrigenManual>(origenInicial)
  const [metodoCobroId, setMetodoCobroId] = useState('')
  const [monto, setMonto] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Cuando cambia el origen, filtrar metodos segun aplique
  const soloEfectivo = ORIGENES_SOLO_EFECTIVO.includes(origen)
  const metodosFiltrados = soloEfectivo
    ? metodos.filter((m) => m.tipo === 'EFECTIVO')
    : metodos

  // Metodo seleccionado
  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobroId)
  const monedaMetodo = metodoSeleccionado?.moneda ?? 'USD'

  // Saldo actual del metodo seleccionado (para calcular avance por porcentaje)
  const { data: saldoData } = useQuery(
    metodoCobroId
      ? `SELECT saldo_actual FROM metodos_cobro WHERE id = ? LIMIT 1`
      : '',
    metodoCobroId ? [metodoCobroId] : []
  )
  const saldoActual = saldoData && saldoData.length > 0
    ? parseFloat((saldoData[0] as { saldo_actual: string }).saldo_actual) || 0
    : 0

  useEffect(() => {
    // Si el metodo actual no esta en la lista filtrada, limpiar
    if (metodoCobroId && !metodosFiltrados.find((m) => m.id === metodoCobroId)) {
      setMetodoCobroId('')
    }
  }, [origen, metodoCobroId, metodosFiltrados])

  // Cuando cambia el porcentaje en avance, actualizar el monto
  useEffect(() => {
    if (origen !== 'AVANCE' || !porcentaje) return
    const pct = parseFloat(porcentaje)
    if (isNaN(pct) || pct <= 0 || saldoActual <= 0) return
    const calculado = Number((saldoActual * pct / 100).toFixed(2))
    setMonto(calculado.toFixed(2))
  }, [porcentaje, saldoActual, origen])

  function resetFields() {
    setMetodoCobroId('')
    setMonto('')
    setPorcentaje('')
    setConcepto('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const tipo = tipoDeOrigen(origen)

    const parsed = movimientoManualSchema.safeParse({
      metodo_cobro_id: metodoCobroId,
      tipo,
      origen,
      monto: parseFloat(monto) || 0,
      concepto,
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
      await createMovimientoManual({
        metodo_cobro_id: parsed.data.metodo_cobro_id,
        origen: parsed.data.origen,
        monto: parsed.data.monto,
        concepto: parsed.data.concepto,
        sesion_caja_id: sesionCajaId,
        empresa_id: user.empresa_id!,
        usuario_id: user.id,
      })
      toast.success(`${ORIGEN_LABELS[origen]} registrado exitosamente`)
      resetFields()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const tipo = tipoDeOrigen(origen)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipo de operacion */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de Operacion
        </label>
        <NativeSelect
          value={origen}
          onChange={(e) => setOrigen(e.target.value as OrigenManual)}
        >
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {ORIGEN_LABELS[o]}
            </option>
          ))}
        </NativeSelect>
        {soloEfectivo && (
          <p className="text-xs text-amber-600 mt-1">
            Este tipo solo aplica a metodos de cobro en Efectivo
          </p>
        )}
      </div>

      {/* Metodo de cobro */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Metodo de Cobro
        </label>
        <NativeSelect
          value={metodoCobroId}
          onChange={(e) => setMetodoCobroId(e.target.value)}
          disabled={loadingMetodos}
        >
          <option value="">
            {loadingMetodos ? 'Cargando...' : 'Seleccionar metodo'}
          </option>
          {metodosFiltrados.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} ({m.moneda})
            </option>
          ))}
        </NativeSelect>
        {errors.metodo_cobro_id && (
          <p className="text-red-500 text-xs mt-1">{errors.metodo_cobro_id}</p>
        )}
      </div>

      {/* Porcentaje para avance (calcula el monto automaticamente) */}
      {origen === 'AVANCE' && metodoCobroId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Porcentaje de Avance
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max="100"
              step="0.01"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="ej: 50"
              className="no-spinner w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">%</span>
            {saldoActual > 0 && (
              <span className="text-xs text-gray-500">
                de {monedaMetodo} {saldoActual.toFixed(2)} disponible
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            El monto se calcula automaticamente segun el porcentaje del saldo actual
          </p>
        </div>
      )}

      {/* Monto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Monto ({monedaMetodo || 'USD'})
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={monto}
          onChange={(e) => {
            setMonto(e.target.value)
            // Limpiar porcentaje si el usuario escribe monto manualmente
            if (origen === 'AVANCE') setPorcentaje('')
          }}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          className={`no-spinner w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.monto ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.monto && (
          <p className="text-red-500 text-xs mt-1">{errors.monto}</p>
        )}
      </div>

      {/* Concepto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Descripcion del movimiento..."
          rows={3}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
            errors.concepto ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.concepto && (
          <p className="text-red-500 text-xs mt-1">{errors.concepto}</p>
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
          className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
            tipo === 'EGRESO'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {submitting ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────

export function MovimientoManualForm({
  isOpen,
  onClose,
  sesionCajaId,
  origenInicial = 'INGRESO_MANUAL',
}: MovimientoManualFormProps) {
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {ORIGEN_LABELS[origenInicial]}
        </h2>
        <FormMovimientoManual
          onClose={onClose}
          sesionCajaId={sesionCajaId}
          origenInicial={origenInicial}
        />
      </div>
    </dialog>
  )
}
