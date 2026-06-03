import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@powersync/react'
import { useNavigate } from '@tanstack/react-router'
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
import { useCajasDisponibles } from '@/features/configuracion/hooks/use-cajas'
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
  const { cajas, isLoading: loadingCajas } = useCajasDisponibles()
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

// ─── Fila de cuadre ──────────────────────────────────────────

function CuadreRow({
  sign,
  label,
  usd,
  bs,
  isEgreso = false,
  isTotals = false,
  showZero = false,
}: {
  sign: string
  label: string
  usd: number
  bs: number
  isEgreso?: boolean
  isTotals?: boolean
  showZero?: boolean
}) {
  const amountClass = isTotals
    ? 'font-semibold text-foreground'
    : isEgreso
    ? 'text-red-500'
    : 'text-emerald-600'
  const signClass = isTotals ? 'text-muted-foreground' : isEgreso ? 'text-red-500' : 'text-emerald-600'
  const showValue = (v: number) => (v !== 0 || showZero || isTotals) ? v.toFixed(2) : '–'

  return (
    <div className="flex items-center gap-1 text-xs">
      <span className={`shrink-0 w-3 font-bold ${signClass}`}>{sign}</span>
      <span className={`flex-1 min-w-0 ${isTotals ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`shrink-0 w-20 text-right tabular-nums ${amountClass}`}>
        {showValue(usd)}
      </span>
      <span className={`shrink-0 w-20 text-right tabular-nums ${amountClass}`}>
        {showValue(bs)}
      </span>
    </div>
  )
}

// ─── Resumen de sesion (para cierre) ─────────────────────────

function ResumenSesion({ sesionId }: { sesionId: string }) {
  const { data: sesionData } = useQuery(
    sesionId
      ? 'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?'
      : '',
    sesionId ? [sesionId] : []
  )

  // Ingresos de efectivo por venta, separados por moneda del metodo de cobro
  const { data: pagosEfectivoData } = useQuery(
    sesionId
      ? `SELECT
           COALESCE(SUM(CASE WHEN mc.moneda = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE 0 END), 0) AS ventas_usd,
           COALESCE(SUM(CASE WHEN mc.moneda != 'USD' THEN CAST(p.monto_bs  AS REAL) ELSE 0 END), 0) AS ventas_bs
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND p.is_reversed = 0`
      : '',
    sesionId ? [sesionId] : []
  )

  // Movimientos manuales de efectivo agrupados por origen y moneda
  const { data: movsData } = useQuery(
    sesionId
      ? `SELECT
           mmc.origen,
           COALESCE(SUM(CASE WHEN mc.moneda = 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_usd,
           COALESCE(SUM(CASE WHEN mc.moneda != 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_bs
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         WHERE mmc.sesion_caja_id = ?
           AND mc.tipo = 'EFECTIVO'
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
         GROUP BY mmc.origen`
      : '',
    sesionId ? [sesionId] : []
  )

  // Cobros CxC vía POS (SAF) en métodos EFECTIVO de esta sesión
  const { data: cobrosEfectivoData } = useQuery(
    sesionId
      ? `SELECT
           COALESCE(SUM(CASE WHEN mc.moneda = 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS cobros_usd,
           COALESCE(SUM(CASE WHEN mc.moneda != 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS cobros_bs
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         WHERE mmc.sesion_caja_id = ?
           AND mc.tipo = 'EFECTIVO'
           AND mmc.origen = 'COBRO'`
      : '',
    sesionId ? [sesionId] : []
  )

  const sesion = (sesionData ?? [])[0] as
    | { monto_apertura_usd: string; monto_apertura_bs: string }
    | undefined

  if (!sesion) return null

  const aperturaUsd = parseFloat(sesion.monto_apertura_usd) || 0
  const aperturaBs  = parseFloat(sesion.monto_apertura_bs)  || 0

  const pagosRow = (pagosEfectivoData ?? [])[0] as
    | { ventas_usd: number; ventas_bs: number }
    | undefined
  const ventasUsd = pagosRow?.ventas_usd ?? 0
  const ventasBs  = pagosRow?.ventas_bs  ?? 0

  type MovRow = { origen: string; total_usd: number; total_bs: number }
  const movsMap = new Map<string, { usd: number; bs: number }>()
  for (const row of (movsData ?? []) as MovRow[]) {
    movsMap.set(row.origen, { usd: row.total_usd, bs: row.total_bs })
  }

  const ingManualUsd = movsMap.get('INGRESO_MANUAL')?.usd ?? 0
  const ingManualBs  = movsMap.get('INGRESO_MANUAL')?.bs  ?? 0
  const egrManualUsd = movsMap.get('EGRESO_MANUAL')?.usd  ?? 0
  const egrManualBs  = movsMap.get('EGRESO_MANUAL')?.bs   ?? 0
  const avancesUsd   = movsMap.get('AVANCE')?.usd ?? 0
  const avancesBs    = movsMap.get('AVANCE')?.bs  ?? 0
  const prestamosUsd = movsMap.get('PRESTAMO')?.usd ?? 0
  const prestamosBs  = movsMap.get('PRESTAMO')?.bs  ?? 0

  const cobrosRow = (cobrosEfectivoData ?? [])[0] as
    | { cobros_usd: number; cobros_bs: number }
    | undefined
  const cobrosEfUsd = cobrosRow?.cobros_usd ?? 0
  const cobrosEfBs  = cobrosRow?.cobros_bs  ?? 0
  const hayCobrosEf = cobrosEfUsd > 0.005 || cobrosEfBs > 0.005

  const totalUsd = Number((
    aperturaUsd + ventasUsd + cobrosEfUsd + ingManualUsd - egrManualUsd - avancesUsd - prestamosUsd
  ).toFixed(2))
  const totalBs = Number((
    aperturaBs + ventasBs + cobrosEfBs + ingManualBs - egrManualBs - avancesBs - prestamosBs
  ).toFixed(2))

  const hayEgresos =
    egrManualUsd > 0 || egrManualBs > 0 ||
    avancesUsd > 0   || avancesBs > 0   ||
    prestamosUsd > 0 || prestamosBs > 0

  return (
    <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1">
        Cuadre de Efectivo
      </p>

      {/* Cabecera de columnas */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground border-b pb-1.5">
        <span className="shrink-0 w-3" />
        <span className="flex-1" />
        <span className="shrink-0 w-20 text-right font-medium">USD</span>
        <span className="shrink-0 w-20 text-right font-medium">Bs</span>
      </div>

      {/* Saldo inicial */}
      <CuadreRow sign="+" label="Saldo inicial" usd={aperturaUsd} bs={aperturaBs} showZero />

      {/* Ingresos por venta */}
      <CuadreRow sign="+" label="Ingresos por venta" usd={ventasUsd} bs={ventasBs} showZero />

      {/* Cobros CxC vía POS (SAF) en efectivo */}
      {hayCobrosEf && (
        <CuadreRow sign="+" label="Cobros CxC via POS" usd={cobrosEfUsd} bs={cobrosEfBs} />
      )}

      {/* Ingresos manuales de caja */}
      {(ingManualUsd > 0 || ingManualBs > 0) && (
        <CuadreRow sign="+" label="Ingresos de caja" usd={ingManualUsd} bs={ingManualBs} />
      )}

      {/* Separador antes de egresos */}
      {hayEgresos && <div className="border-t border-dashed" />}

      {/* Egresos manuales */}
      {(egrManualUsd > 0 || egrManualBs > 0) && (
        <CuadreRow sign="−" label="Egresos de caja" usd={egrManualUsd} bs={egrManualBs} isEgreso />
      )}

      {/* Avances entregados */}
      {(avancesUsd > 0 || avancesBs > 0) && (
        <CuadreRow sign="−" label="Avances entregados" usd={avancesUsd} bs={avancesBs} isEgreso />
      )}

      {/* Prestamos entregados */}
      {(prestamosUsd > 0 || prestamosBs > 0) && (
        <CuadreRow sign="−" label="Prestamos entregados" usd={prestamosUsd} bs={prestamosBs} isEgreso />
      )}

      {/* Total esperado */}
      <div className="border-t pt-1">
        <CuadreRow sign="=" label="Total efectivo esperado" usd={totalUsd} bs={totalBs} isTotals />
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
  const navigate = useNavigate()

  // Leer caja_id y fecha_apertura para navegar al cuadre tras cerrar
  const { data: sesionMetaData } = useQuery(
    sesionId
      ? 'SELECT caja_id, fecha_apertura FROM sesiones_caja WHERE id = ?'
      : '',
    sesionId ? [sesionId] : []
  )
  const sesionMeta = (sesionMetaData ?? [])[0] as
    | { caja_id: string; fecha_apertura: string }
    | undefined

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
      // Navegar al cuadre con la sesion pre-cargada para que el supervisor complete el cuadre formal
      if (sesionMeta) {
        const fecha = sesionMeta.fecha_apertura.substring(0, 10)
        navigate({
          to: '/ventas/cuadre-de-caja',
          search: { fecha, cajaId: sesionMeta.caja_id, sesionId },
        })
      }
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
