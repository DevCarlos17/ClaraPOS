import { useEffect, useState, type RefObject } from 'react'
import type React from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { BottomSheet } from '@/components/shared/bottom-sheet'
import { useCompraWizardStore, type LineaWizardCompra } from '@/stores/compra-wizard-store'
import {
  getCostoNuevoUsdForLinea,
  aplicarDecisionNivel,
  actualizarPvpInput,
  actualizarMargenInput,
  type TasaContext,
} from '@/features/inventario/lib/compra-pvp-decision'
import { clasificarCasoLinea, lineaTieneDecisionBloqueante, type DecisionPvp } from '@/features/inventario/lib/compra-precio-gating'
import { formatUsd, formatBs } from '@/lib/currency'
import { cn } from '@/lib/utils'

/** 1:1 de `NUMERIC_LIMITS.pvp`/`.margen` en compra-form.tsx (NUMERIC(20,8) en
 * DB para PVP, tope realista de 9999.9% para margen). */
const NUMERIC_LIMITS = {
  pvp: { max: 9_999_999_999, decimals: 8 },
  margen: { max: 9_999, decimals: 1 },
} as const

/** 1:1 de `clampNumeric` en paso-productos.tsx/compra-form.tsx — duplicado
 * intencional, mismo patron ya establecido en el repo (sin util compartida). */
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

interface PvpConfirmSheetProps {
  /**
   * Ref hacia el nodo DOM del `SheetContent` de `CompraWizardSheet`
   * (`compra-wizard-sheet.tsx`). Se reenvia como `portalContainer` para que
   * este sheet secundario stackee ENCIMA del wizard (mismo nodo, apilado por
   * orden de DOM — ver `sheet.tsx`/`bottom-sheet.tsx`), no como un segundo
   * portal a `document.body` (que competiria en z-index con el wizard).
   */
  containerRef: RefObject<HTMLDivElement | null>
}

/**
 * Sheet secundario (stacked sobre `CompraWizardSheet`) que resuelve la
 * decision de PVP por nivel de precio cuando `paso-productos.tsx` detecta un
 * cambio de costo significativo (`abrirPvpDecision`). Mirror mobile de la
 * sub-fila de decision de `compra-form.tsx` (L1780-1873): mismos 3 botones
 * por nivel (Mantener PVP / Mantener margen-Recalcular por % / Editar
 * manual), misma logica Caso A/B (`clasificarCasoLinea`) — CERO formulas
 * nuevas, todo delegado a `compra-pvp-decision.ts` (W4a).
 *
 * Estado: NO usa estado local para los niveles — cada interaccion
 * (`handleDecisionNivel`/`handlePvpInputChange`/`handleMargenInputChange`)
 * escribe directo en `store.lineas[idx].pvp_niveles` via `actualizarLinea`
 * (misma fuente de verdad que `paso-productos.tsx` ya usa). "Confirmar"
 * persiste esos niveles ya resueltos (`confirmarPvpDecision`); "Cancelar"
 * revierte la linea completa (`cancelarPvpDecision`, ya limpia
 * `nuevo_costo_raw`/`costo_input`/`pvp_niveles` — logica de W4a, sin
 * duplicar aqui).
 */
export function PvpConfirmSheet({ containerRef }: PvpConfirmSheetProps) {
  const {
    lineas,
    pvpPendienteLineaIdx,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    actualizarLinea,
    confirmarPvpDecision,
    cancelarPvpDecision,
  } = useCompraWizardStore()

  const idx = pvpPendienteLineaIdx
  const linea = idx !== null ? (lineas[idx] ?? null) : null
  const open = idx !== null && linea !== null

  // Snapshot de la ULTIMA linea/indice validos: mientras el sheet cierra
  // (animacion `data-[state=closed]`, ~300ms), `pvpPendienteLineaIdx` ya es
  // `null` pero el contenido debe seguir visible durante el slide-out en vez
  // de desaparecer de golpe.
  const [snapshot, setSnapshot] = useState<{ idx: number; linea: LineaWizardCompra } | null>(null)
  useEffect(() => {
    if (idx !== null && linea) setSnapshot({ idx, linea })
  }, [idx, linea])

  const displayLinea = linea ?? snapshot?.linea ?? null

  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna
  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'
  const tasaCtx: TasaContext = { moneda, usaTasaParalela, tasaInternaNum: tasaInterna, tasaFacturaNum }

  function handleDecisionNivel(orden: number, decision: DecisionPvp) {
    if (idx === null || !linea) return
    const costoNuevoUsd = getCostoNuevoUsdForLinea(linea, tasaCtx)
    const costoUsdActual = parseFloat(linea.costo_usd_actual) || 0
    const nuevosNiveles = linea.pvp_niveles.map((n) =>
      n.orden !== orden ? n : aplicarDecisionNivel(n, decision, { costoNuevoUsd, costoUsdActual, moneda, tasaFacturaNum })
    )
    actualizarLinea(idx, { pvp_niveles: nuevosNiveles })
  }

  function handlePvpInputChange(orden: number, value: string) {
    if (idx === null || !linea) return
    const clamped = clampNumeric(value, NUMERIC_LIMITS.pvp.max, NUMERIC_LIMITS.pvp.decimals)
    const costoNuevoUsd = getCostoNuevoUsdForLinea(linea, tasaCtx)
    const nuevosNiveles = linea.pvp_niveles.map((n) =>
      n.orden !== orden ? n : actualizarPvpInput(n, clamped, { costoNuevoUsd, moneda, tasaFacturaNum })
    )
    actualizarLinea(idx, { pvp_niveles: nuevosNiveles })
  }

  function handleMargenInputChange(orden: number, value: string) {
    if (idx === null || !linea) return
    const clamped = clampNumeric(value, NUMERIC_LIMITS.margen.max, NUMERIC_LIMITS.margen.decimals)
    const costoNuevoUsd = getCostoNuevoUsdForLinea(linea, tasaCtx)
    const nuevosNiveles = linea.pvp_niveles.map((n) =>
      n.orden !== orden ? n : actualizarMargenInput(n, clamped, { costoNuevoUsd, moneda, tasaFacturaNum })
    )
    actualizarLinea(idx, { pvp_niveles: nuevosNiveles })
  }

  function handleConfirmar() {
    if (idx === null || !linea) return
    confirmarPvpDecision(idx, linea.pvp_niveles)
  }

  function handleCancelar() {
    if (idx === null) return
    cancelarPvpDecision(idx)
  }

  const confirmarDisabled = !linea || lineaTieneDecisionBloqueante(true, linea.pvp_niveles)

  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        // Cerrar por el boton X / click en el overlay / Escape = mismo
        // contrato que "Cancelar": revierte la linea, nunca deja una
        // decision a medio resolver colgando en el store.
        if (!nextOpen && idx !== null) cancelarPvpDecision(idx)
      }}
      title="Confirmar precios"
      bodyClassName="px-4 pb-4 pt-2"
      portalContainer={containerRef.current}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleCancelar}
            className="flex-1 h-11 rounded-xl text-base font-semibold text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={confirmarDisabled}
            className="flex-1 h-11 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>
      }
    >
      {displayLinea && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card shadow-lg p-3 space-y-1">
            <p className="text-sm font-semibold text-foreground truncate">{displayLinea.nombre}</p>
            <p className="text-xs text-muted-foreground">
              Nuevo costo:{' '}
              <span className="font-semibold text-foreground">
                {moneda === 'USD' ? formatUsd(displayLinea.costo_input) : formatBs(displayLinea.costo_input)}
              </span>
            </p>
          </div>

          <div className="space-y-2.5">
            {displayLinea.pvp_niveles.map((nivel) => {
              const casoLinea = clasificarCasoLinea(displayLinea.pvp_niveles)
              return (
                <div
                  key={nivel.orden}
                  className={cn(
                    'rounded-xl border p-3 space-y-2',
                    nivel.violado ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm font-semibold flex items-center gap-1', nivel.violado ? 'text-destructive' : 'text-foreground')}>
                      {nivel.violado && <span aria-hidden>⚠</span>}
                      {nivel.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      PVP actual: {formatUsd(nivel.pvp_actual_usd)}
                    </span>
                  </div>

                  {nivel.decision === 'pendiente' ? (
                    <div className="space-y-2">
                      <p className={cn('text-xs', parseFloat(nivel.margen_si_mantiene_pvp) < 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                        Si se mantiene el PVP: margen {nivel.margen_si_mantiene_pvp}%
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {casoLinea === 'A' && (
                          <button
                            type="button"
                            onClick={() => handleDecisionNivel(nivel.orden, 'mantener_pvp')}
                            className="h-10 rounded-xl px-3 text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-400 transition-colors"
                          >
                            Mantener PVP
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDecisionNivel(nivel.orden, 'mantener_margen')}
                          className="h-10 rounded-xl px-3 text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 transition-colors"
                        >
                          {casoLinea === 'A' ? 'Mantener margen' : 'Recalcular por %'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecisionNivel(nivel.orden, 'manual')}
                          className="h-10 rounded-xl px-3 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                        >
                          Editar manual
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {nivel.decision === 'manual' ? (
                        <>
                          <label className="text-xs text-muted-foreground">Margen %</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nivel.margen_input}
                            onChange={(e) => handleMargenInputChange(nivel.orden, e.target.value)}
                            onKeyDown={handleNumericKeyDown}
                            onPaste={handleNumericPaste}
                            className="w-20 rounded-xl border border-input bg-background px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <label className="text-xs text-muted-foreground">PVP ({monedaLabel})</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nivel.pvp_input}
                            onChange={(e) => handlePvpInputChange(nivel.orden, e.target.value)}
                            onKeyDown={handleNumericKeyDown}
                            onPaste={handleNumericPaste}
                            className={cn(
                              'w-24 rounded-xl border px-2 py-2 text-sm text-right focus:outline-none focus:ring-2',
                              nivel.violado ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'
                            )}
                          />
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          Margen {nivel.margen_input}% · PVP{' '}
                          {moneda === 'USD' ? formatUsd(parseFloat(nivel.pvp_input) || 0) : formatBs(parseFloat(nivel.pvp_input) || 0)}
                        </span>
                      )}
                      <button
                        type="button"
                        title="Cambiar decisión"
                        onClick={() => handleDecisionNivel(nivel.orden, 'pendiente')}
                        className="ml-auto text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ArrowCounterClockwise className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
