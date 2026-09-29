import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Plus, Trash, X, CashRegister, Vault, Warning } from '@phosphor-icons/react'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { useMetodosCxP } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { SelectSheet } from '@/components/shared/select-sheet'
import { db } from '@/core/db/powersync/db'
import { formatHora } from '@/lib/format'
import { formatUsd, formatBs } from '@/lib/currency'
import { totalizarLineasCargo } from '@/features/inventario/lib/compra-lineas-cargo'
import {
  getLineSubtotal,
  calcDesgloseUsd,
  convertirLineasCargo,
  calcTotalUsd,
  calcTotalUsdSistema,
  calcPendienteUsd,
} from '@/features/inventario/lib/compra-desglose'

/** NUMERIC(12,2) en DB — tope practico para montos de cargo/pago. 1:1 de compra-form.tsx. */
const MONTO_LIMIT = { max: 9_999_999_999, decimals: 2 } as const

function clampNumeric(value: string, max: number, decimals: number): string {
  if (value === '' || value === '-') return value
  const num = parseFloat(value)
  if (isNaN(num)) return value
  if (num > max) return max.toFixed(decimals)
  const parts = value.split('.')
  if (parts[1] && parts[1].length > decimals) {
    return parts[0] + '.' + parts[1].slice(0, decimals)
  }
  return value
}

function handleNumericKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const allowed = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ]
  if (allowed.includes(e.key)) return
  if (e.key === '.' && !e.currentTarget.value.includes('.')) return
  if (!/^\d$/.test(e.key)) e.preventDefault()
}

function handleNumericPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (cleaned !== text) {
    e.preventDefault()
    toast.error('Pegado bloqueado: ingresá el valor manualmente para evitar errores.')
  }
}

const SAFE_TEXT_RE = /^[A-Za-z0-9\-]$/

function handleSafeTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const control = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ]
  if (control.includes(e.key)) return
  if (e.ctrlKey || e.metaKey) return
  if (e.altKey) { e.preventDefault(); return }
  if (!SAFE_TEXT_RE.test(e.key)) e.preventDefault()
}

function handleSafeTextPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  const cleaned = text.replace(/[^A-Za-z0-9\-]/g, '')
  if (cleaned !== text) e.preventDefault()
}

/**
 * Paso 3 del wizard de compra — Cargos adicionales + Pagos. Sin props: lee/
 * escribe `useCompraWizardStore()` directamente. Los totales se recomponen
 * ACA via `compra-desglose.ts`/`compra-lineas-cargo.ts` (funciones puras de
 * W3a) — el modulo no expone un hook, asi que `compra-wizard.tsx` (para el
 * `WizardAcumulador`) y este paso (para el boton "Max" + el total en vivo)
 * recomponen la MISMA formula cada uno via `useMemo`, igual que
 * `compra-form.tsx` las computa inline. Anadir un
 * `use-compra-desglose-usd.ts` que unifique ambos call-sites queda fuera del
 * alcance asignado a W3b (ver design.md decision #4 — diferido).
 */
export function PasoCargosPagos() {
  const { user } = useCurrentUser()
  const {
    lineas,
    lineasCargo,
    pagos,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    destinoCobro,
    sesionActivaId,
    agregarCargo,
    actualizarCargo,
    quitarCargo,
    agregarPago,
    actualizarPago,
    quitarPago,
    setDestinoCobro,
  } = useCompraWizardStore()

  const { metodos, isLoading: loadingMetodos } = useMetodosCxP()
  const [sesionActivaHora, setSesionActivaHora] = useState<string | null>(null)

  // Deteccion de sesion de caja activa — 1:1 de compra-form.tsx L345-368 /
  // paso-pagos.tsx (gasto). I/O a PowerSync, vive ACA (no en el store).
  useEffect(() => {
    if (!user?.empresa_id) return
    db.execute(
      "SELECT id, fecha_apertura FROM sesiones_caja WHERE empresa_id = ? AND status = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1",
      [user.empresa_id]
    )
      .then((res) => {
        const row = res.rows?.item(0) as { id: string; fecha_apertura: string } | undefined
        if (row) {
          setSesionActivaHora(formatHora(row.fecha_apertura))
          setDestinoCobro({ destinoCobro: 'CAJA', sesionActivaId: row.id })
        } else {
          setSesionActivaHora(null)
          setDestinoCobro({ destinoCobro: 'TESORERIA', sesionActivaId: null })
        }
      })
      .catch(() => {
        setSesionActivaHora(null)
        setDestinoCobro({ destinoCobro: 'TESORERIA', sesionActivaId: null })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.empresa_id])

  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna
  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'

  // ── Totales en vivo — 1:1 de compra-form.tsx L472-540 ──────────────────────
  const totalDisplay = useMemo(
    () => lineas.reduce((sum, l) => new Decimal(sum).plus(getLineSubtotal(l)).toNumber(), 0),
    [lineas]
  )
  const desgloseUsd = useMemo(
    () => calcDesgloseUsd(lineas, moneda, tasaFacturaNum),
    [lineas, moneda, tasaFacturaNum]
  )
  const totalIvaBs = useMemo(
    () =>
      lineas.reduce((sum, l) => {
        if (l.tipo_impuesto !== 'Gravable') return sum
        return new Decimal(sum).plus(new Decimal(getLineSubtotal(l)).times(l.impuesto_pct).dividedBy(100)).toNumber()
      }, 0),
    [lineas]
  )
  const totalIvaDisplay = moneda === 'USD' ? desgloseUsd.totalIvaUsd : totalIvaBs
  const totalConIvaDisplay = new Decimal(totalDisplay).plus(totalIvaDisplay).toNumber()

  const lineasCargoUsd = useMemo(
    () => convertirLineasCargo(lineasCargo, moneda, tasaFacturaNum),
    [lineasCargo, moneda, tasaFacturaNum]
  )
  const cargoTotales = useMemo(() => totalizarLineasCargo(lineasCargoUsd), [lineasCargoUsd])
  const totalCargoUsd = new Decimal(cargoTotales.exentoUsd).plus(cargoTotales.baseUsd).plus(cargoTotales.ivaUsd).toNumber()

  const totalUsd = calcTotalUsd(totalConIvaDisplay, totalCargoUsd, moneda, tasaFacturaNum)
  const totalBs = (
    moneda === 'BS'
      ? new Decimal(totalConIvaDisplay).plus(new Decimal(totalCargoUsd).times(tasaFacturaNum))
      : new Decimal(totalUsd).times(tasaFacturaNum)
  ).toNumber()
  const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaFacturaNum, tasaInterna, usaTasaParalela)

  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const mUsd = p.moneda === 'BS'
      ? (tasaFacturaNum > 0 ? new Decimal(p.monto).dividedBy(tasaFacturaNum).toNumber() : 0)
      : p.monto
    return new Decimal(sum).plus(mUsd).toNumber()
  }, 0)
  const totalAbonadoBs = pagos.reduce((sum, p) => {
    const mBs = p.moneda === 'USD' ? new Decimal(p.monto).times(tasaFacturaNum).toNumber() : p.monto
    return new Decimal(sum).plus(mBs).toNumber()
  }, 0)
  const pendienteUsd = calcPendienteUsd(totalUsd, pagos, tasaFacturaNum)
  const pendienteBs = Math.max(0, new Decimal(totalBs).minus(totalAbonadoBs).toDecimalPlaces(2).toNumber())
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  function handleMetodoChange(index: number, metodoId: string) {
    const metodo = metodos.find((m) => m.id === metodoId)
    actualizarPago(index, {
      metodo_cobro_id: metodoId,
      metodo_nombre: metodo?.nombre ?? '',
      moneda: (metodo?.moneda as 'USD' | 'BS') ?? 'USD',
      banco_empresa_id: metodo?.banco_empresa_id ?? null,
      monto: 0,
    })
  }

  function handleMax(index: number) {
    const pago = pagos[index]
    const metodo = metodos.find((m) => m.id === pago?.metodo_cobro_id)
    if (!metodo || totalUsd <= 0) return
    const monto = metodo.moneda === 'BS' ? Number(pendienteBs.toFixed(2)) : Number(pendienteUsd.toFixed(2))
    actualizarPago(index, { monto })
  }

  return (
    <div className="space-y-4">
      {/* ── Cargos adicionales ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Cargos adicionales</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => agregarCargo('EMPAQUE')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-input bg-background text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Empaque
            </button>
            <button
              type="button"
              onClick={() => agregarCargo('FLETE')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-input bg-background text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Flete
            </button>
          </div>
        </div>

        {lineasCargo.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin cargos adicionales. Usa los botones de arriba para agregar material de empaque o flete cobrado por el proveedor.
          </p>
        ) : (
          <ul className="space-y-2">
            {lineasCargo.map((linea) => {
              const incompleta = linea.monto_input.trim() === '' || parseFloat(linea.monto_input) <= 0
              return (
                <li
                  key={linea.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 ${incompleta ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/50'}`}
                >
                  <span className="text-xs font-medium text-foreground w-24 shrink-0">
                    {linea.concepto === 'EMPAQUE' ? 'Empaque' : 'Flete'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={linea.monto_input}
                    onChange={(e) =>
                      actualizarCargo(linea.id, {
                        monto_input: clampNumeric(e.target.value, MONTO_LIMIT.max, MONTO_LIMIT.decimals),
                      })
                    }
                    onKeyDown={handleNumericKeyDown}
                    onPaste={handleNumericPaste}
                    placeholder={`Monto (${monedaLabel})`}
                    className={`flex-1 min-w-0 rounded border px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${
                      incompleta ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-input bg-background'
                    }`}
                  />
                  <select
                    value={linea.porcentaje_iva}
                    onChange={(e) =>
                      actualizarCargo(linea.id, { porcentaje_iva: e.target.value === '16' ? 16 : 0 })
                    }
                    className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={0}>IVA 0%</option>
                    <option value={16}>IVA 16%</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => quitarCargo(linea.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Eliminar cargo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Pagos ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Pagos</h3>
          <div className="flex items-center gap-2">
            {tipoDetectado === 'CONTADO' && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 ring-1 ring-green-600/20">
                CONTADO
              </span>
            )}
            {tipoDetectado === 'CREDITO' && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 ring-1 ring-orange-600/20">
                CREDITO
              </span>
            )}
            <button
              type="button"
              onClick={agregarPago}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar pago
            </button>
          </div>
        </div>

        {/* ── ¿Dónde salen estos pagos? ── */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">¿Dónde salen estos pagos?</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!sesionActivaId}
              onClick={() => setDestinoCobro({ destinoCobro: 'CAJA', sesionActivaId })}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                destinoCobro === 'CAJA'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-background border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <CashRegister size={13} /> Sesión de caja
            </button>
            <button
              type="button"
              onClick={() => setDestinoCobro({ destinoCobro: 'TESORERIA', sesionActivaId })}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                destinoCobro === 'TESORERIA'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              <Vault size={13} /> Tesorería
            </button>
          </div>
          {destinoCobro === 'CAJA' && sesionActivaHora && (
            <p className="text-[11px] text-green-600">✓ Sesión activa desde las {sesionActivaHora}</p>
          )}
          {!sesionActivaId && (
            <p className="text-[11px] text-amber-600">Sin sesión de caja abierta — los pagos irán a Tesorería.</p>
          )}
        </div>

        {pagos.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">
              Sin pagos registrados. La factura se procesará completamente a crédito.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {pagos.map((pago, index) => {
            const metodoSeleccionado = metodos.find((m) => m.id === pago.metodo_cobro_id)
            const requiereReferencia = metodoSeleccionado?.requiere_referencia === 1
            return (
              <div key={index} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Pago {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => quitarPago(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Eliminar pago"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>

                {/* Metodo | Monto en la misma linea */}
                <div className="grid grid-cols-2 gap-2 items-start">
                  <SelectSheet
                    value={pago.metodo_cobro_id}
                    onChange={(val) => handleMetodoChange(index, val)}
                    disabled={loadingMetodos}
                    title="Seleccionar método de pago"
                    placeholder={loadingMetodos ? 'Cargando...' : 'Método'}
                    searchPlaceholder="Buscar método..."
                    emptyMessage="No hay métodos de pago"
                    options={metodos.map((m) => ({
                      value: m.id,
                      label: m.nombre,
                      sublabel: m.moneda,
                      keywords: `${m.nombre} ${m.moneda}`,
                    }))}
                  />
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pago.monto === 0 ? '' : String(pago.monto)}
                      onChange={(e) => {
                        const clamped = clampNumeric(e.target.value, MONTO_LIMIT.max, MONTO_LIMIT.decimals)
                        const num = parseFloat(clamped)
                        actualizarPago(index, { monto: isNaN(num) ? 0 : num })
                      }}
                      onKeyDown={handleNumericKeyDown}
                      onPaste={handleNumericPaste}
                      placeholder={`Monto ${pago.moneda}`}
                      className="w-full rounded-xl border border-input px-3 py-2 text-sm text-right bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {pendienteUsd > 0 && metodoSeleccionado && (
                      <button
                        type="button"
                        onClick={() => handleMax(index)}
                        className="mt-1 text-xs text-primary hover:underline block ml-auto"
                      >
                        Usar máximo
                      </button>
                    )}
                  </div>
                </div>

                {requiereReferencia && (
                  <input
                    type="text"
                    value={pago.referencia ?? ''}
                    onChange={(e) => actualizarPago(index, { referencia: e.target.value.toUpperCase() })}
                    onKeyDown={handleSafeTextKeyDown}
                    onPaste={handleSafeTextPaste}
                    placeholder="Nro de referencia"
                    maxLength={100}
                    className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                )}
              </div>
            )
          })}
        </div>

        {pagos.length > 0 && totalUsd > 0 && (
          <div
            className={`rounded-md px-3 py-2 text-xs flex justify-between items-center flex-wrap gap-1 ${
              pendienteUsd < 0.01
                ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
                : 'bg-muted/50 border border-border text-muted-foreground'
            }`}
          >
            <span>Abonado: {formatUsd(totalAbonadoUsd)}</span>
            <span className="font-semibold text-foreground">Total: {formatUsd(totalUsd)}</span>
            <span>{pendienteUsd < 0.01 ? 'Cancelado' : `Pendiente: ${formatUsd(pendienteUsd)}`}</span>
          </div>
        )}
      </div>

      {/* ── Total en vivo ── */}
      {totalUsd > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total factura</span>
            <div className="text-right">
              <p className="font-bold text-foreground tabular-nums">{formatUsd(totalUsd)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatBs(totalBs)}</p>
            </div>
          </div>
          {usaTasaParalela && (
            <div className="flex justify-between text-xs text-amber-700 dark:text-amber-400 pt-1 border-t border-amber-200 dark:border-amber-800">
              <span className="inline-flex items-center gap-1">
                <Warning className="h-3 w-3" />
                Costo contabilidad (tasa int.):
              </span>
              <span className="font-semibold">{formatUsd(totalUsdSistema)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
