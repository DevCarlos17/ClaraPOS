import { useEffect } from 'react'
import Decimal from 'decimal.js'
import { usdToBs, bsToUsd, type DecimalInput } from '@/lib/currency'
import { toMaskedDisplay } from '@/lib/decimal-display-mask'
import { evaluarSafMonto, type SafMontoEstado } from '@/lib/saf-monto'

interface SafMontoDualInputProps {
  /** Fuente de verdad USD — el padre la posee (controlado), NUNCA se clampea aqui. */
  montoUsdStr: string
  /** Companion Bs — el padre la posee (controlado). */
  montoBsStr: string
  disponibleUsd: DecimalInput
  totalUsd: DecimalInput
  tasa: DecimalInput
  onUsdChange: (val: string) => void
  onBsChange: (val: string) => void
  /** Lift-up del estado al llamador (mirror `onExcedeTopeChange` de `refund-tesoreria-form.tsx`) para que componga su propio gate de submit con `estado === 'ok'`. */
  onEstadoChange?: (estado: SafMontoEstado) => void
}

/** Parseo defensivo: un string a mitad de edicion (ej. "1.") nunca debe tirar — solo afecta la DERIVACION del campo companero, nunca lo que se guarda/muestra en el campo que el usuario esta tipeando. */
function toDecimalSafe(val: string): Decimal {
  if (val.trim() === '') return new Decimal(0)
  try {
    return new Decimal(val)
  } catch {
    return new Decimal(0)
  }
}

/**
 * Input dual USD+Bs para montos de Saldo A Favor (SAF), compartido entre
 * `cobro-modal.tsx` (POS), `abono-global-modal.tsx` y `pago-factura-modal.tsx`
 * (CxC) — PR-A1 de sdd/saf-snapshot-y-trazabilidad/design-b22-dual-input
 * (#5267). Reemplaza el clamp silencioso de `capSafMontoUsd` por el estado
 * explicito de `evaluarSafMonto`: el input NUNCA rechaza el tecleo ni
 * clampea en silencio — `aria-invalid` + mensaje `<p>` + `onEstadoChange`
 * forman el contrato completo (mismo patron que el campo Monto de
 * `refund-tesoreria-form.tsx:602-671`).
 *
 * Bidireccional: editar USD deriva el companero Bs via `usdToBs`; editar Bs
 * deriva el companero USD via `bsToUsd`. El campo que el usuario esta
 * tipeando NUNCA se reformatea — solo el companero se redondea a 2
 * decimales de display (`toMaskedDisplay`, `precision_view`).
 */
export function SafMontoDualInput({
  montoUsdStr,
  montoBsStr,
  disponibleUsd,
  totalUsd,
  tasa,
  onUsdChange,
  onBsChange,
  onEstadoChange,
}: SafMontoDualInputProps) {
  const estado = evaluarSafMonto(montoUsdStr, disponibleUsd, totalUsd)
  const esInvalido = estado !== 'ok'

  useEffect(() => {
    onEstadoChange?.(estado)
  }, [estado, onEstadoChange])

  const handleUsdChange = (val: string) => {
    onUsdChange(val)
    const tasaDecimal = toDecimalSafe(String(tasa))
    const bsDerivado = tasaDecimal.greaterThan(0) ? usdToBs(toDecimalSafe(val), tasaDecimal) : new Decimal(0)
    onBsChange(toMaskedDisplay(bsDerivado.toString(), 2))
  }

  const handleBsChange = (val: string) => {
    onBsChange(val)
    const tasaDecimal = toDecimalSafe(String(tasa))
    const usdDerivado = tasaDecimal.greaterThan(0) ? bsToUsd(toDecimalSafe(val), tasaDecimal) : new Decimal(0)
    // USD es el campo canonico/persistido (regla CLAUDE.md #10: redondear
    // solo al final de la cadena) — NUNCA enmascarar aqui a 2dp, a
    // diferencia de Bs (companion de solo-display en handleUsdChange).
    onUsdChange(usdDerivado.toString())
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Monto SAF (USD)"
            aria-invalid={esInvalido}
            value={montoUsdStr}
            onChange={(e) => handleUsdChange(e.target.value)}
            placeholder="0.00"
            className={`h-7 w-20 rounded-md border px-2 text-xs bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${esInvalido ? 'border-destructive' : 'border-input'}`}
          />
          <span className="text-xs text-blue-700">USD</span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Monto SAF (Bs)"
            aria-invalid={esInvalido}
            value={montoBsStr}
            onChange={(e) => handleBsChange(e.target.value)}
            placeholder="0.00"
            className={`h-7 w-20 rounded-md border px-2 text-xs bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${esInvalido ? 'border-destructive' : 'border-input'}`}
          />
          <span className="text-xs text-blue-700">Bs</span>
        </div>
      </div>
      {estado === 'excedeTotal' && (
        <p className="mt-2 text-xs text-destructive">El monto ingresado excede el total a pagar.</p>
      )}
      {estado === 'excedeDisponible' && (
        <p className="mt-2 text-xs text-destructive">El monto ingresado excede el saldo a favor disponible.</p>
      )}
    </div>
  )
}
