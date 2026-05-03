import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@powersync/react'
import { CashRegister, Lock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
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
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { NativeSelect } from '@/components/ui/native-select'

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
  const { tasaValor } = useTasaActual()

  const [cajaId, setCajaId] = useState('')
  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function resetFields() {
    setCajaId('')
    setMontoUsd('')
    setMontoBs('')
    setErrors({})
  }

  const montoUsdNum = parseFloat(montoUsd) || 0
  const montoBsNum = parseFloat(montoBs) || 0
  const totalEquivUsd = tasaValor > 0
    ? Number((montoUsdNum + montoBsNum / tasaValor).toFixed(2))
    : montoUsdNum

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = sesionCajaAperturaSchema.safeParse({
      caja_id: cajaId,
      monto_apertura_usd: montoUsdNum,
      monto_apertura_bs: montoBsNum,
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
        monto_apertura_bs: parsed.data.monto_apertura_bs,
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
        <label htmlFor="apertura-caja" className="block text-sm font-medium mb-1">
          Caja
        </label>
        <NativeSelect
          id="apertura-caja"
          value={cajaId}
          onChange={(e) => setCajaId(e.target.value)}
          disabled={loadingCajas}
        >
          <option value="">
            {loadingCajas ? 'Cargando cajas...' : 'Seleccionar caja'}
          </option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </NativeSelect>
        {errors.caja_id && (
          <p className="text-destructive text-xs mt-1">{errors.caja_id}</p>
        )}
      </div>

      {/* Fondos de apertura bimonetarios */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Fondo de Apertura</p>

        {/* USD */}
        <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5">
          <label htmlFor="apertura-monto-usd" className="block text-xs font-medium text-muted-foreground">
            Efectivo USD
          </label>
          <input
            id="apertura-monto-usd"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={montoUsd}
            onChange={(e) => setMontoUsd(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.00"
            className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
              errors.monto_apertura_usd ? 'border-destructive' : ''
            }`}
          />
          {errors.monto_apertura_usd && (
            <p className="text-destructive text-xs">{errors.monto_apertura_usd}</p>
          )}
        </div>

        {/* Bs */}
        <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5">
          <label htmlFor="apertura-monto-bs" className="block text-xs font-medium text-muted-foreground">
            Efectivo Bs
          </label>
          <input
            id="apertura-monto-bs"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={montoBs}
            onChange={(e) => setMontoBs(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.00"
            className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
              errors.monto_apertura_bs ? 'border-destructive' : ''
            }`}
          />
          {errors.monto_apertura_bs && (
            <p className="text-destructive text-xs">{errors.monto_apertura_bs}</p>
          )}
        </div>

        {/* Total equivalente */}
        {(montoUsdNum > 0 || montoBsNum > 0) && tasaValor > 0 && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
            Total equivalente: <span className="font-medium text-foreground">USD {totalEquivUsd.toFixed(2)}</span>
            {montoBsNum > 0 && (
              <span className="ml-1">(tasa: {tasaValor.toFixed(4)})</span>
            )}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {submitting ? 'Abriendo...' : 'Abrir Sesion'}
        </Button>
      </div>
    </form>
  )
}

// ─── Resumen de sesion (para cierre) ─────────────────────────

function ResumenSesion({ sesionId }: { sesionId: string }) {
  const { data: pagosData } = useQuery(
    sesionId
      ? `SELECT mc.nombre as metodo_nombre, mc.tipo as tipo_metodo,
                COALESCE(SUM(CAST(p.monto_usd AS REAL)), 0) as total_pagos,
                COUNT(*) as num_pagos
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         WHERE p.sesion_caja_id = ? AND p.is_reversed = 0
         GROUP BY mc.id, mc.nombre, mc.tipo
         ORDER BY mc.tipo, mc.nombre`
      : '',
    sesionId ? [sesionId] : []
  )

  const { data: movsData } = useQuery(
    sesionId
      ? `SELECT mc.nombre as metodo_nombre,
                SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END) as total_ingreso_manual,
                SUM(CASE WHEN mmc.tipo = 'EGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END) as total_egreso_manual
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         WHERE mmc.sesion_caja_id = ?
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
         GROUP BY mc.id, mc.nombre`
      : '',
    sesionId ? [sesionId] : []
  )

  const { data: sesionData } = useQuery(
    sesionId ? 'SELECT monto_apertura_usd FROM sesiones_caja WHERE id = ?' : '',
    sesionId ? [sesionId] : []
  )

  const sesion = (sesionData ?? [])[0] as { monto_apertura_usd: string } | undefined
  const montoApertura = sesion ? parseFloat(sesion.monto_apertura_usd) : 0

  const pagos = (pagosData ?? []) as Array<{
    metodo_nombre: string
    tipo_metodo: string
    total_pagos: number
    num_pagos: number
  }>

  const movsManualesMap = new Map<string, { ingreso: number; egreso: number }>()
  for (const row of (movsData ?? []) as Array<{
    metodo_nombre: string
    total_ingreso_manual: number
    total_egreso_manual: number
  }>) {
    movsManualesMap.set(row.metodo_nombre, {
      ingreso: row.total_ingreso_manual,
      egreso: row.total_egreso_manual,
    })
  }

  const pagosEfectivo = pagos
    .filter((p) => p.tipo_metodo === 'EFECTIVO')
    .reduce((acc, p) => acc + p.total_pagos, 0)

  const ingresosManualEfectivo = pagos
    .filter((p) => p.tipo_metodo === 'EFECTIVO')
    .reduce((acc, p) => {
      const manual = movsManualesMap.get(p.metodo_nombre) ?? { ingreso: 0, egreso: 0 }
      return acc + manual.ingreso - manual.egreso
    }, 0)

  const totalEsperadoEfectivo = Number(
    (montoApertura + pagosEfectivo + ingresosManualEfectivo).toFixed(2)
  )

  const hayData = pagos.length > 0 || movsData?.length

  if (!hayData) return null

  return (
    <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Resumen de la Sesion
      </p>

      {/* Apertura */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Monto de apertura</span>
        <span className="font-medium text-foreground">USD {montoApertura.toFixed(2)}</span>
      </div>

      {/* Pagos por metodo */}
      {pagos.map((p) => {
        const manual = movsManualesMap.get(p.metodo_nombre) ?? { ingreso: 0, egreso: 0 }
        return (
          <div key={p.metodo_nombre} className="space-y-0.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pagos — {p.metodo_nombre}</span>
              <span className="font-medium text-emerald-600">+{p.total_pagos.toFixed(2)}</span>
            </div>
            {manual.ingreso > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-3">
                <span>Ingresos manuales</span>
                <span className="text-emerald-600">+{manual.ingreso.toFixed(2)}</span>
              </div>
            )}
            {manual.egreso > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-3">
                <span>Egresos manuales</span>
                <span className="text-red-500">-{manual.egreso.toFixed(2)}</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Total efectivo esperado */}
      <div className="flex justify-between text-xs font-semibold text-foreground border-t pt-2">
        <span>Total efectivo esperado</span>
        <span>USD {totalEsperadoEfectivo.toFixed(2)}</span>
      </div>
    </div>
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
      {/* Resumen de la sesion */}
      <ResumenSesion sesionId={sesionId} />

      {/* Monto fisico */}
      <div>
        <label htmlFor="cierre-monto" className="block text-sm font-medium mb-1">
          Monto Fisico en Caja (USD)
        </label>
        <input
          id="cierre-monto"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={montoFisico}
          onChange={(e) => setMontoFisico(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
            errors.monto_fisico_usd ? 'border-destructive' : ''
          }`}
        />
        {errors.monto_fisico_usd && (
          <p className="text-destructive text-xs mt-1">{errors.monto_fisico_usd}</p>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <label htmlFor="cierre-obs" className="block text-sm font-medium mb-1">
          Observaciones <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          id="cierre-obs"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Notas sobre el cierre..."
          rows={3}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {submitting ? 'Cerrando...' : 'Cerrar Sesion'}
        </Button>
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

  const isApertura = mode === 'apertura'

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
    >
      {/* iOS-style colored header */}
      <div
        className={`px-6 pt-5 pb-4 border-b ${
          isApertura
            ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/5'
            : 'bg-gradient-to-br from-amber-500/15 to-amber-400/5'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl ${
              isApertura ? 'bg-emerald-500/15' : 'bg-amber-500/15'
            }`}
          >
            {isApertura ? (
              <CashRegister size={18} className="text-emerald-600" weight="fill" />
            ) : (
              <Lock size={18} className="text-amber-600" weight="fill" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              {isApertura ? 'Abrir Sesion de Caja' : 'Cerrar Sesion de Caja'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isApertura
                ? 'Registra el fondo inicial de la caja'
                : 'Reconcilia y cierra la sesion activa'}
            </p>
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="p-5">
        {isApertura ? (
          <FormApertura onClose={onClose} />
        ) : (
          sesionId && <FormCierre sesionId={sesionId} onClose={onClose} />
        )}
      </div>
    </dialog>
  )
}
