import { useEffect, useState } from 'react'
import type React from 'react'
import { UserPlus, Warning, Info, Money } from '@phosphor-icons/react'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'
import { convertirMontoRawEntreMonedas } from '@/features/inventario/lib/convertir-monto-moneda'
import { db } from '@/core/db/powersync/db'
import { todayStr } from '@/lib/dates'

/**
 * Guards de input duplicados 1:1 de `compra-form.tsx` (no exportados alli —
 * mismo criterio de duplicacion que `buscarTasaPorFecha` en el
 * `paso-identificacion.tsx` del wizard de gasto: ~20 lineas, no vale la pena
 * una extraccion compartida solo para esto).
 */
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
  if (cleaned !== text) {
    e.preventDefault()
    const sanitized = cleaned.toUpperCase()
    const input = e.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const newValue = input.value.slice(0, start) + sanitized + input.value.slice(end)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set
    nativeInputValueSetter?.call(input, newValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
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

/** NUMERIC(12,4) en DB → tope practico para tasas Bs/USD. 1:1 de compra-form.tsx. */
const TASA_LIMIT = { max: 9_999_999, decimals: 4 } as const

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

/**
 * Busca la tasa interna para `fecha`: si es hoy, usa la tasa vigente actual
 * (`useTasaActual`); si es pasada, busca la ultima tasa registrada en o
 * antes de esa fecha. 1:1 de `compra-form.tsx` L295-328 (efecto de
 * auto-lookup), extraido a funcion pura de I/O para reusar en el wizard.
 */
async function buscarTasaInternaPorFecha(
  fecha: string,
  empresaId: string,
  tasaVigente: number
): Promise<{ valor: number; found: boolean } | null> {
  if (fecha === todayStr()) {
    return tasaVigente > 0 ? { valor: tasaVigente, found: true } : { valor: 0, found: false }
  }
  try {
    const rows = await db.getAll<{ valor: string }>(
      `SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND substr(fecha, 1, 10) <= ? ORDER BY fecha DESC LIMIT 1`,
      [empresaId, fecha]
    )
    if (rows.length > 0) return { valor: parseFloat(rows[0].valor), found: true }
    return { valor: 0, found: false }
  } catch {
    return null
  }
}

/**
 * Paso 1 del wizard de compra — Cabecera. Sin props: lee/escribe
 * `useCompraWizardStore()` directamente (mismo patron que
 * `paso-identificacion.tsx` del wizard de gasto). El side-effect de
 * auto-fill de tasa por fecha vive ACA (no en el store — mismo criterio que
 * gasto, ver design.md Open Questions: "el store se mantiene sin I/O a
 * PowerSync").
 */
export function PasoCabecera() {
  const { user } = useCurrentUser()
  const { tasaValor } = useTasaActual()
  const {
    fechaFactura,
    nroFactura,
    nroControl,
    proveedorId,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaInternaManual,
    tasaProveedor,
    lineasCargo,
    setCabecera,
    actualizarCargo,
  } = useCompraWizardStore()

  const { proveedores, isLoading: loadingProveedores } = useProveedoresActivos()
  const [crearProveedorOpen, setCrearProveedorOpen] = useState(false)

  // tasaInterna/tasaProveedor son `number` en el store (a diferencia del
  // string de gasto-wizard-store.ts / compra-form.tsx) — se mantiene un
  // estado local de texto crudo para permitir tipear decimales ("12.")
  // sin que el binding controlado lo trunque en cada render. Ambos setters
  // escriben a ambos estados (local + store) en el mismo punto, nunca via
  // un efecto de sincronizacion separado (evita el loop tipico de este patron).
  const [tasaInternaRaw, setTasaInternaRaw] = useState(tasaInterna > 0 ? tasaInterna.toFixed(4) : '')
  const [tasaProveedorRaw, setTasaProveedorRaw] = useState(tasaProveedor > 0 ? tasaProveedor.toFixed(4) : '')

  // Inicializar fecha a hoy la primera vez que se monta el paso, si aun no hay una
  useEffect(() => {
    if (!fechaFactura) setCabecera({ fechaFactura: todayStr() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-lookup tasa interna por fecha — 1:1 de compra-form.tsx L295-328
  useEffect(() => {
    if (!fechaFactura || !user?.empresa_id) return
    let cancelled = false
    buscarTasaInternaPorFecha(fechaFactura, user.empresa_id, tasaValor).then((result) => {
      if (cancelled || !result) return
      if (result.found) {
        setTasaInternaRaw(result.valor.toFixed(4))
        setCabecera({ tasaInterna: result.valor, tasaInternaManual: false })
      } else {
        setTasaInternaRaw('')
        setCabecera({ tasaInterna: 0, tasaInternaManual: true })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaFactura, user?.empresa_id, tasaValor])

  function handleTasaInternaChange(value: string) {
    const clamped = clampNumeric(value, TASA_LIMIT.max, TASA_LIMIT.decimals)
    setTasaInternaRaw(clamped)
    const num = parseFloat(clamped)
    setCabecera({ tasaInterna: isNaN(num) ? 0 : num, tasaInternaManual: true })
  }

  function handleTasaProveedorChange(value: string) {
    const clamped = clampNumeric(value, TASA_LIMIT.max, TASA_LIMIT.decimals)
    setTasaProveedorRaw(clamped)
    const num = parseFloat(clamped)
    setCabecera({ tasaProveedor: isNaN(num) ? 0 : num })
  }

  const hoy = todayStr()
  const fechaEsFutura = Boolean(fechaFactura && fechaFactura > hoy)
  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna

  /**
   * Cambia la moneda del documento. Reconvierte `lineasCargo.monto_input`
   * (Material de Empaque / Flete) igual que `compra-form.tsx::handleMonedaSwitch`
   * L961-1022 — los productos (Paso 2) siempre estan vacios en este PR
   * (placeholder), asi que no hay lineas de producto que reconvertir aun.
   */
  function handleMonedaSwitch(newMoneda: 'USD' | 'BS') {
    if (newMoneda === moneda || tasaFacturaNum <= 0) return
    for (const cargo of lineasCargo) {
      actualizarCargo(cargo.id, {
        monto_input: convertirMontoRawEntreMonedas(cargo.monto_input, newMoneda, tasaFacturaNum),
      })
    }
    setCabecera({ moneda: newMoneda })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Fecha Factura <span className="text-destructive">*</span>
          </label>
          <input
            type="date"
            value={fechaFactura}
            onChange={(e) => setCabecera({ fechaFactura: e.target.value })}
            className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {fechaEsFutura && (
            <p className="mt-1 text-amber-600 dark:text-amber-400 text-[11px]">
              ⚠ La fecha es posterior a hoy. Verifique que sea correcta.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Nro. Factura <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={nroFactura}
            onChange={(e) => setCabecera({ nroFactura: e.target.value.toUpperCase() })}
            onKeyDown={handleSafeTextKeyDown}
            onPaste={handleSafeTextPaste}
            placeholder="Ej: 00012345"
            maxLength={50}
            autoComplete="off"
            className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Nro. Control <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <input
          type="text"
          value={nroControl}
          onChange={(e) => setCabecera({ nroControl: e.target.value.toUpperCase() })}
          onKeyDown={handleSafeTextKeyDown}
          onPaste={handleSafeTextPaste}
          placeholder="Ej: 00-0012345"
          maxLength={20}
          autoComplete="off"
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-muted-foreground">
            Proveedor <span className="text-destructive">*</span>
          </label>
          <button
            type="button"
            onClick={() => setCrearProveedorOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        </div>
        <select
          value={proveedorId}
          onChange={(e) => setCabecera({ proveedorId: e.target.value })}
          disabled={loadingProveedores}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{loadingProveedores ? 'Cargando...' : 'Seleccionar proveedor'}</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rif} - {p.razon_social}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Moneda del documento fisico
        </label>
        <p className="text-[11px] text-muted-foreground/70 mb-2">
          Solo afecta la visualizacion. El asiento contable siempre se genera en Bolivares.
        </p>
        <div className="inline-flex rounded-xl border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => handleMonedaSwitch('USD')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              moneda === 'USD'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Money className="h-4 w-4" />
            USD
          </button>
          <button
            type="button"
            onClick={() => handleMonedaSwitch('BS')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              moneda === 'BS'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Money className="h-4 w-4" />
            Bs
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            Tasa Interna (Bs/USD) <span className="text-destructive">*</span>
          </label>
          {tasaInternaManual ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Warning className="h-3 w-3" />
              Sin tasa para esta fecha
            </span>
          ) : (
            tasaInternaRaw && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <Info className="h-3 w-3" />
                Detectada automáticamente
              </span>
            )
          )}
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={tasaInternaRaw}
          onChange={(e) => handleTasaInternaChange(e.target.value)}
          onKeyDown={handleNumericKeyDown}
          placeholder="0.0000"
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      <div>
        <div className="flex items-center gap-2">
          <input
            id="wizard-tasa-paralela-check"
            type="checkbox"
            checked={usaTasaParalela}
            onChange={(e) => setCabecera({ usaTasaParalela: e.target.checked })}
            className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
          <label htmlFor="wizard-tasa-paralela-check" className="text-sm text-foreground cursor-pointer select-none">
            Proveedor usa tasa paralela (distinta a la tasa interna BCV)
          </label>
        </div>
        {usaTasaParalela && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50/80 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-2">
            <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
              Tasa Proveedor (Paralela) (Bs/USD) <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={tasaProveedorRaw}
              onChange={(e) => handleTasaProveedorChange(e.target.value)}
              onKeyDown={handleNumericKeyDown}
              placeholder="0.0000"
              className="w-full rounded-xl border border-amber-200 dark:border-amber-700 px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        )}
      </div>

      <ProveedorForm isOpen={crearProveedorOpen} onClose={() => setCrearProveedorOpen(false)} />
    </div>
  )
}
