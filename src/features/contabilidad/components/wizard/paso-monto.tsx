import { Warning, Info } from '@phosphor-icons/react'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useGastoTotales } from '@/features/contabilidad/lib/use-gasto-totales'
import { formatUsd, formatBs } from '@/lib/currency'
import type { MonedaFacturaGasto } from '@/features/contabilidad/lib/gasto-totales'

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/**
 * Paso 2 del wizard de gasto — Monto e IVA. Sin props: lee/escribe
 * `useGastoWizardStore()` directamente. Totales en vivo via `useGastoTotales`
 * (wrapper de `gasto-totales.ts`, W2a).
 */
export function PasoMonto() {
  const {
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaInternaManual,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
    setMonto,
  } = useGastoWizardStore()
  const { impuestos } = useImpuestosActivos()

  const { ivaFactura, totalFacturaNum, montoContableUsd } = useGastoTotales({
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
  })

  const montoFacturaNum = parseFloat(montoFactura) || 0
  const porcentajeIvaNum = parseFloat(porcentajeIva) || 0
  const tasaProveedorNum = parseFloat(tasaProveedor) || 0
  const tasaInternaNum = parseFloat(tasaInterna) || 0

  return (
    <div className="space-y-4">
      {/* ── Tipo de Factura ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tipo de Factura
        </p>

        <div className="flex gap-3">
          {(['USD', 'BS'] as MonedaFacturaGasto[]).map((m) => (
            <label
              key={m}
              className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${
                monedaFactura === m
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-border text-foreground hover:bg-muted/40'
              }`}
            >
              <input
                type="radio"
                name="moneda_factura"
                value={m}
                checked={monedaFactura === m}
                onChange={() => setMonto({ monedaFactura: m, montoFactura: '' })}
                className="accent-primary"
              />
              Factura en {m === 'USD' ? 'Dólares (USD)' : 'Bolívares (Bs)'}
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={usaTasaParalela}
            onChange={(e) =>
              setMonto({
                usaTasaParalela: e.target.checked,
                tasaProveedor: e.target.checked ? tasaProveedor : '',
              })
            }
            className="h-4 w-4 accent-primary rounded"
          />
          <span className="text-sm text-foreground">La factura usa tasa paralela (dólar paralelo)</span>
        </label>

        {usaTasaParalela && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tasa del Proveedor (Bs/USD) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasaProveedor}
              onChange={(e) => setMonto({ tasaProveedor: e.target.value })}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="0.0000"
              className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              Tasa Interna (Bs/USD) <span className="text-destructive">*</span>
            </label>
            {tasaInternaManual ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                <Warning className="h-3 w-3" />
                Sin tasa registrada para esta fecha
              </span>
            ) : (
              tasaInterna && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                  <Info className="h-3 w-3" />
                  Detectada automáticamente
                </span>
              )
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={tasaInterna}
            onChange={(e) => setMonto({ tasaInterna: e.target.value, tasaInternaManual: true })}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="0.0000"
            className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
          />
        </div>
      </div>

      {/* ── Monto e IVA ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monto e IVA</p>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tipo de Impuesto <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            {(['Exento', 'Exonerado', 'Gravable'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => {
                  if (tipo !== 'Gravable') {
                    setMonto({ tipoImpuesto: tipo, porcentajeIva: '' })
                    return
                  }
                  if (!porcentajeIva && impuestos.length > 0) {
                    const ivaDefault = impuestos.find((i) => i.tipo_tributo === 'IVA')
                    setMonto({ tipoImpuesto: tipo, porcentajeIva: ivaDefault ? ivaDefault.porcentaje : porcentajeIva })
                    return
                  }
                  setMonto({ tipoImpuesto: tipo })
                }}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  tipoImpuesto === tipo
                    ? tipo === 'Gravable'
                      ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700'
                      : 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
        </div>

        {tipoImpuesto === 'Gravable' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Porcentaje IVA (%) <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={porcentajeIva}
                onChange={(e) => setMonto({ porcentajeIva: e.target.value })}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder="16.00"
                className={`w-28 rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
              />
              {impuestos
                .filter((i) => i.tipo_tributo === 'IVA')
                .map((imp) => (
                  <button
                    key={imp.id}
                    type="button"
                    onClick={() => setMonto({ porcentajeIva: imp.porcentaje })}
                    className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {imp.nombre} ({parseFloat(imp.porcentaje)}%)
                  </button>
                ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {tipoImpuesto === 'Gravable'
              ? `Base Imponible (${monedaFactura}) — antes de IVA`
              : `Monto de la Factura (${monedaFactura})`}{' '}
            <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={montoFactura}
            onChange={(e) => setMonto({ montoFactura: e.target.value })}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder={monedaFactura === 'USD' ? '0.00 USD' : '0.00 Bs'}
            className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
          />
        </div>

        {tipoImpuesto === 'Gravable' && montoFacturaNum > 0 && porcentajeIvaNum > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Base imponible:</span>
              <span className="tabular-nums font-mono text-foreground font-semibold">
                {montoFacturaNum.toFixed(2)} {monedaFactura}
              </span>
            </div>
            <div className="flex justify-between text-amber-700 dark:text-amber-400">
              <span>IVA ({porcentajeIvaNum}%):</span>
              <span className="tabular-nums font-mono">+ {ivaFactura.toFixed(2)} {monedaFactura}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground border-t border-amber-200 dark:border-amber-700 pt-1">
              <span>Total factura:</span>
              <span className="tabular-nums font-mono">{totalFacturaNum.toFixed(2)} {monedaFactura}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Total contable (calculado, solo visual) ── */}
      {montoContableUsd !== null && montoContableUsd > 0 && (
        <div className="rounded-md bg-muted/60 border border-border px-4 py-2.5 space-y-1">
          {usaTasaParalela && tasaProveedorNum > 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total {monedaFactura} (con IVA):</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {monedaFactura === 'USD' ? formatUsd(totalFacturaNum) : formatBs(totalFacturaNum)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground/70">
                <span>Total Contable USD:</span>
                <span className="tabular-nums">{formatUsd(montoContableUsd)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Contable USD:</span>
                <span className="font-semibold text-foreground tabular-nums">{formatUsd(montoContableUsd)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground/70">
                <span>Equivalente Bs (tasa interna):</span>
                <span className="tabular-nums">{formatBs(montoContableUsd * tasaInternaNum)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
