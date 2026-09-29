import { Warning, Info } from '@phosphor-icons/react'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useGastoTotales } from '@/features/contabilidad/lib/use-gasto-totales'
import { formatUsd, formatBs } from '@/lib/currency'
import type { MonedaFacturaGasto } from '@/features/contabilidad/lib/gasto-totales'

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/**
 * Paso 2 del wizard de gasto (mobile fullscreen) — Monto e IVA.
 *
 * Orden de campos:
 *   - Chip de proveedor seleccionado (solo visual, contexto)
 *   - Cuenta contable (movida desde Paso 1)
 *   - Tipo de factura USD / BS
 *   - Botones IVA (Exento / Exonerado / Gravable) + selector de alicuota
 *   - Monto (base imponible o monto total segun tipo IVA)
 *   - Descripcion (opcional)
 *   - Desglose calculado (base + IVA + total)
 *   - Total contable USD
 */
export function PasoMonto() {
  const {
    cuentaId,
    proveedorId,
    descripcion,
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
    setIdentificacion,
    setMonto,
  } = useGastoWizardStore()

  const { cuentas, isLoading: loadingCuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores } = useProveedores()
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

  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId)

  return (
    <div className="space-y-4 pt-2">
      {/* ── Chip de contexto: proveedor seleccionado ── */}
      {proveedorSeleccionado && (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Proveedor:</span>
          <span className="text-sm font-semibold text-foreground truncate">
            {proveedorSeleccionado.razon_social}
          </span>
        </div>
      )}

      {/* ── Cuenta Contable ── */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Cuenta Contable <span className="text-destructive">*</span>
        </label>
        <select
          value={cuentaId}
          onChange={(e) => setIdentificacion({ cuentaId: e.target.value })}
          disabled={loadingCuentas}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{loadingCuentas ? 'Cargando...' : 'Seleccionar cuenta'}</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} - {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* ── Tipo de Factura USD / BS ── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Tipo de Factura</p>
        <div className="flex gap-3">
          {(['USD', 'BS'] as MonedaFacturaGasto[]).map((m) => (
            <label
              key={m}
              className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                monedaFactura === m
                  ? 'border-primary bg-primary/5 text-primary font-semibold'
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
      </div>

      {/* ── Botones IVA ── */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
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
                  setMonto({
                    tipoImpuesto: tipo,
                    porcentajeIva: ivaDefault ? ivaDefault.porcentaje : porcentajeIva,
                  })
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

        {/* Selector de alicuota cuando es Gravable */}
        {tipoImpuesto === 'Gravable' && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Alícuota IVA (%) <span className="text-destructive">*</span>
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
      </div>

      {/* ── Monto ── */}
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

      {/* ── Descripcion (opcional) ── */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Descripción <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setIdentificacion({ descripcion: e.target.value })}
          placeholder="Descripción del gasto..."
          rows={2}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* ── Desglose calculado (Gravable con datos) ── */}
      {tipoImpuesto === 'Gravable' && montoFacturaNum > 0 && porcentajeIvaNum > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-3 space-y-1 text-sm">
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
          <div className="flex justify-between font-bold text-foreground border-t border-amber-200 dark:border-amber-700 pt-1.5 mt-0.5 text-base">
            <span>Total factura:</span>
            <span className="tabular-nums font-mono">{totalFacturaNum.toFixed(2)} {monedaFactura}</span>
          </div>
        </div>
      )}

      {/* ── Total contable (solo visual) ── */}
      {montoContableUsd !== null && montoContableUsd > 0 && (
        <div className="rounded-xl bg-muted/60 border border-border px-4 py-3 space-y-1">
          {usaTasaParalela && tasaProveedorNum > 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total {monedaFactura} (con IVA):</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {monedaFactura === 'USD' ? formatUsd(totalFacturaNum) : formatBs(totalFacturaNum)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Total Contable USD:</span>
                <span className="tabular-nums">{formatUsd(montoContableUsd)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Contable USD:</span>
                <span className="font-bold text-foreground text-base tabular-nums">{formatUsd(montoContableUsd)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Equivalente Bs:</span>
                <span className="tabular-nums">{formatBs(montoContableUsd * tasaInternaNum)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Aviso tasa interna */}
      {!tasaInterna && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400 flex items-center gap-2">
          <Warning className="h-3.5 w-3.5 shrink-0" />
          Ingresa la tasa interna en el Paso 1 para calcular el total contable
        </div>
      )}

      {tasaInterna && !montoFactura && (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <Info className="h-3 w-3" />
          Ingresa el monto para ver el desglose
        </p>
      )}
    </div>
  )
}
