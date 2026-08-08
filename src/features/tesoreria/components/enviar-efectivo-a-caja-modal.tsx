import { useEffect, useRef, useState } from 'react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useQuery } from '@powersync/react'
import { Button } from '@/components/ui/button'
import { db } from '@/core/db/powersync/db'
import { crearTraspasoTesoreriaASesion } from '@/features/tesoreria/hooks/use-traspasos'
import { formatFechaHoraMovimiento } from '@/features/tesoreria/utils/format-movimiento-fecha'
import type { CajaFuerte } from '@/features/tesoreria/hooks/use-caja-fuerte'

// ─── Props ────────────────────────────────────────────────────

interface EnviarEfectivoACajaModalProps {
  open: boolean
  onClose: () => void
  cajasFuerteActivas: CajaFuerte[]
  empresaId: string
  userId: string
}

// ─── Tipos internos ───────────────────────────────────────────

interface SesionActiva {
  id: string
  created_at: string
  caja_id: string | null
  usuario_nombre: string | null
  caja_nombre: string | null
}

// ─── Formulario interno ───────────────────────────────────────

function FormEnviarEfectivo({
  onClose,
  cajasFuerteActivas,
  empresaId,
  userId,
}: {
  onClose: () => void
  cajasFuerteActivas: CajaFuerte[]
  empresaId: string
  userId: string
}) {
  const [selectedSesionId, setSelectedSesionId] = useState('')
  const [selectedCajaFuerteId, setSelectedCajaFuerteId] = useState('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Sesiones activas de la empresa
  const { data: sesionesData, isLoading: loadingSesiones } = useQuery(
    empresaId
      ? `SELECT sc.id, sc.created_at, sc.caja_id,
               u.nombre AS usuario_nombre,
               c.nombre AS caja_nombre
         FROM sesiones_caja sc
         LEFT JOIN usuarios u ON sc.usuario_apertura_id = u.id
         LEFT JOIN cajas c ON sc.caja_id = c.id
         WHERE sc.empresa_id = ? AND sc.status = 'ABIERTA'
         ORDER BY sc.created_at DESC`
      : '',
    empresaId ? [empresaId] : []
  )

  const sesiones = (sesionesData ?? []) as SesionActiva[]

  const selectedCaja = cajasFuerteActivas.find((c) => c.id === selectedCajaFuerteId)
  const montoNum = parseFloat(monto) || 0
  const saldoCaja = parseFloat(selectedCaja?.saldo_actual ?? '0')

  function reset() {
    setSelectedSesionId('')
    setSelectedCajaFuerteId('')
    setMonto('')
    setDescripcion('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (!selectedSesionId) newErrors.sesion = 'Selecciona una sesion de caja destino'
    if (!selectedCajaFuerteId) newErrors.cajaFuerte = 'Selecciona una caja fuerte origen'
    if (montoNum <= 0) newErrors.monto = 'El monto debe ser mayor a 0'
    if (selectedCaja && montoNum > saldoCaja + 0.001) {
      newErrors.monto = `Saldo insuficiente. Disponible: ${saldoCaja.toFixed(2)}`
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    try {
      // Verificar que la sesion sigue ABIERTA antes de proceder
      const sesionRes = await db.execute(
        'SELECT status FROM sesiones_caja WHERE id = ? LIMIT 1',
        [selectedSesionId]
      )
      const status = (sesionRes.rows?.item(0) as { status: string } | undefined)?.status
      if (status !== 'ABIERTA') {
        throw new Error('La sesion de caja seleccionada ya no esta activa')
      }

      // Buscar el metodo de cobro EFECTIVO que coincide con la moneda de la caja fuerte
      if (!selectedCaja) throw new Error('Caja fuerte no encontrada')
      const metodoRes = await db.execute(
        'SELECT id FROM metodos_cobro WHERE empresa_id = ? AND tipo = ? AND moneda_id = ? AND is_active = 1 LIMIT 1',
        [empresaId, 'EFECTIVO', selectedCaja.moneda_id]
      )
      if (!metodoRes.rows?.length) {
        throw new Error('No hay metodo de cobro EFECTIVO configurado para la moneda de esta caja fuerte')
      }
      const metodoCobroid = (metodoRes.rows.item(0) as { id: string }).id

      await crearTraspasoTesoreriaASesion({
        cajaFuerteId: selectedCajaFuerteId,
        sesionCajaId: selectedSesionId,
        metodoCobroid,
        monto: montoNum.toFixed(4),
        monedaId: selectedCaja.moneda_id,
        empresaId,
        userId,
        descripcion: descripcion.trim() || 'Envio de efectivo a sesion de caja',
      })

      toast.success('Efectivo enviado a la sesion de caja exitosamente')
      reset()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      setErrors({ general: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Selector de sesion activa */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Sesion de caja destino
        </label>
        {loadingSesiones ? (
          <p className="text-sm text-muted-foreground">Cargando sesiones...</p>
        ) : sesiones.length === 0 ? (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
            No hay sesiones de caja abiertas en este momento
          </p>
        ) : (
          <select
            value={selectedSesionId}
            onChange={(e) => { setSelectedSesionId(e.target.value); setErrors({}) }}
            className={`flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              errors.sesion ? 'border-destructive' : ''
            }`}
          >
            <option value="">-- Selecciona una sesion --</option>
            {sesiones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.usuario_nombre ?? 'Usuario'} — {s.caja_nombre ?? 'Caja'} ({formatFechaHoraMovimiento(s.created_at, s.created_at)})
              </option>
            ))}
          </select>
        )}
        {errors.sesion && <p className="text-destructive text-xs mt-1">{errors.sesion}</p>}
      </div>

      {/* Selector de caja fuerte origen */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Caja fuerte origen
        </label>
        <select
          value={selectedCajaFuerteId}
          onChange={(e) => { setSelectedCajaFuerteId(e.target.value); setErrors({}) }}
          className={`flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
            errors.cajaFuerte ? 'border-destructive' : ''
          }`}
        >
          <option value="">-- Selecciona una caja fuerte --</option>
          {cajasFuerteActivas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} — Saldo: {c.saldo_actual}
            </option>
          ))}
        </select>
        {errors.cajaFuerte && <p className="text-destructive text-xs mt-1">{errors.cajaFuerte}</p>}
        {selectedCaja && (
          <p className="text-xs text-muted-foreground mt-1 px-1">
            Saldo disponible: <span className="font-medium">{saldoCaja.toFixed(4)}</span>
          </p>
        )}
      </div>

      {/* Monto */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Monto a enviar
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={monto}
          onChange={(e) => { setMonto(e.target.value); setErrors({}) }}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
            errors.monto ? 'border-destructive' : ''
          }`}
        />
        {errors.monto && <p className="text-destructive text-xs mt-1">{errors.monto}</p>}
      </div>

      {/* Descripcion opcional */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Descripcion <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Motivo del envio..."
          rows={2}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {errors.general && (
        <p className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center p-2.5">
          {errors.general}
        </p>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting || sesiones.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {submitting ? 'Enviando...' : 'Enviar efectivo'}
        </Button>
      </div>
    </form>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────

export function EnviarEfectivoACajaModal({
  open,
  onClose,
  cajasFuerteActivas,
  empresaId,
  userId,
}: EnviarEfectivoACajaModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
    >
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500/15 to-blue-400/5 px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/15">
            <PaperPlaneTilt size={18} className="text-blue-600" weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Enviar efectivo a caja</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transferir efectivo desde Tesoreria a una sesion de caja activa
            </p>
          </div>
        </div>
      </div>
      {/* Form body */}
      <div className="p-5">
        <FormEnviarEfectivo
          onClose={onClose}
          cajasFuerteActivas={cajasFuerteActivas}
          empresaId={empresaId}
          userId={userId}
        />
      </div>
    </dialog>
  )
}
