import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useCuentasDetalle } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { crearAsientoManual } from '@/features/contabilidad/hooks/use-libro-contable'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import type { LineaAsiento } from '@/features/contabilidad/lib/generar-asientos'

// ─── Props ────────────────────────────────────────────────────

interface LibroContableFormProps {
  isOpen: boolean
  onClose: () => void
}

interface LineaForm {
  id: string
  cuenta_contable_id: string
  monto: string
  tipo: 'debe' | 'haber'
  detalle: string
}

// ─── Componente ───────────────────────────────────────────────

export function LibroContableForm({ isOpen, onClose }: LibroContableFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { cuentas } = useCuentasDetalle()

  const [docRef, setDocRef] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([
    { id: '1', cuenta_contable_id: '', monto: '', tipo: 'debe', detalle: '' },
    { id: '2', cuenta_contable_id: '', monto: '', tipo: 'haber', detalle: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Totales ──────────────────────────────────────────────

  const totalDebe = lineas
    .filter((l) => l.tipo === 'debe')
    .reduce((sum, l) => sum + (parseFloat(l.monto) || 0), 0)

  const totalHaber = lineas
    .filter((l) => l.tipo === 'haber')
    .reduce((sum, l) => sum + (parseFloat(l.monto) || 0), 0)

  const diferencia = totalDebe - totalHaber
  const isBalanced = Math.abs(diferencia) < 0.01

  // ─── Dialog ───────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setDocRef('')
      setLineas([
        { id: '1', cuenta_contable_id: '', monto: '', tipo: 'debe', detalle: '' },
        { id: '2', cuenta_contable_id: '', monto: '', tipo: 'haber', detalle: '' },
      ])
      setError(null)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  // ─── Lineas ───────────────────────────────────────────────

  function addLinea(tipo: 'debe' | 'haber') {
    setLineas((prev) => [
      ...prev,
      { id: Date.now().toString(), cuenta_contable_id: '', monto: '', tipo, detalle: '' },
    ])
  }

  function removeLinea(id: string) {
    if (lineas.length <= 2) return
    setLineas((prev) => prev.filter((l) => l.id !== id))
  }

  function updateLinea(id: string, field: keyof LineaForm, value: string) {
    setLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    )
  }

  // ─── Submit ───────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!user) {
      setError('No se pudo identificar el usuario')
      return
    }

    // Validar que todas las lineas tengan cuenta y monto
    for (const linea of lineas) {
      if (!linea.cuenta_contable_id) {
        setError('Todas las lineas deben tener una cuenta seleccionada')
        return
      }
      if (!linea.monto || parseFloat(linea.monto) <= 0) {
        setError('Todos los montos deben ser mayores a cero')
        return
      }
      if (!linea.detalle.trim()) {
        setError('Todas las lineas deben tener un detalle')
        return
      }
    }

    if (!isBalanced) {
      setError(`Los totales no cuadran. Diferencia: ${Math.abs(diferencia).toFixed(2)}`)
      return
    }

    // Convertir a LineaAsiento con signo
    const lineasAsiento: LineaAsiento[] = lineas.map((l) => ({
      cuenta_contable_id: l.cuenta_contable_id,
      monto: l.tipo === 'debe' ? parseFloat(l.monto) : -parseFloat(l.monto),
      detalle: l.detalle.trim(),
    }))

    setSubmitting(true)
    try {
      await crearAsientoManual({
        lineas: lineasAsiento,
        doc_origen_ref: docRef.trim() || undefined,
        empresa_id: user.empresa_id!,
        usuario_id: user.id,
      })
      toast.success('Asiento manual creado correctamente')
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  // ─── Render ───────────────────────────────────────────────

  const debeLineas = lineas.filter((l) => l.tipo === 'debe')
  const haberLineas = lineas.filter((l) => l.tipo === 'haber')

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Asiento Contable Manual</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Referencia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referencia del Documento <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={docRef}
              onChange={(e) => setDocRef(e.target.value.toUpperCase())}
              placeholder="Ej: DOC-001"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Totales */}
          <div className={`flex items-center justify-between p-3 rounded-lg border ${
            isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="text-sm">
              <span className="text-gray-600">DEBE: </span>
              <span className="font-mono font-semibold text-blue-700">{totalDebe.toFixed(2)}</span>
              <span className="text-gray-400 mx-3">|</span>
              <span className="text-gray-600">HABER: </span>
              <span className="font-mono font-semibold text-red-700">{totalHaber.toFixed(2)}</span>
            </div>
            <div className={`text-sm font-semibold ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
              {isBalanced ? 'Cuadrado' : `Diferencia: ${Math.abs(diferencia).toFixed(2)}`}
            </div>
          </div>

          {/* Columnas DEBE / HABER */}
          <div className="grid grid-cols-2 gap-4">
            {/* DEBE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-700">DEBE (Cargos)</h3>
                <button
                  type="button"
                  onClick={() => addLinea('debe')}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>
              {debeLineas.map((linea) => (
                <div key={linea.id} className="space-y-1 p-2 bg-blue-50 rounded border border-blue-100">
                  <select
                    value={linea.cuenta_contable_id}
                    onChange={(e) => updateLinea(linea.id, 'cuenta_contable_id', e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={linea.monto}
                    onChange={(e) => updateLinea(linea.id, 'monto', e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={linea.detalle}
                      onChange={(e) => updateLinea(linea.id, 'detalle', e.target.value)}
                      placeholder="Detalle"
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {lineas.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLinea(linea.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* HABER */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-red-700">HABER (Abonos)</h3>
                <button
                  type="button"
                  onClick={() => addLinea('haber')}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                >
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>
              {haberLineas.map((linea) => (
                <div key={linea.id} className="space-y-1 p-2 bg-red-50 rounded border border-red-100">
                  <select
                    value={linea.cuenta_contable_id}
                    onChange={(e) => updateLinea(linea.id, 'cuenta_contable_id', e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={linea.monto}
                    onChange={(e) => updateLinea(linea.id, 'monto', e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={linea.detalle}
                      onChange={(e) => updateLinea(linea.id, 'detalle', e.target.value)}
                      placeholder="Detalle"
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {lineas.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLinea(linea.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

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
              disabled={submitting || !isBalanced}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Crear Asiento'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
