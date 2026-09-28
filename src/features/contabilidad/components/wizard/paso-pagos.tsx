import { useEffect, useState } from 'react'
import { Plus, Trash, CashRegister, Vault, Warning } from '@phosphor-icons/react'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useMetodosCxP } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useGastoTotales } from '@/features/contabilidad/lib/use-gasto-totales'
import { db } from '@/core/db/powersync/db'
import { formatUsd } from '@/lib/currency'
import { formatHora } from '@/lib/format'

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/**
 * Paso 3 del wizard de gasto — Pagos/Abonos. Sin props: lee/escribe
 * `useGastoWizardStore()` directamente. La deteccion de sesion de caja
 * activa (efecto con I/O a PowerSync) vive ACA, no en el store — mismo
 * patron que `gasto-form.tsx` L368-397 (design.md Open Questions).
 */
export function PasoPagos() {
  const { user } = useCurrentUser()
  const {
    pagos,
    agregarPago,
    actualizarPago,
    eliminarPago,
    destinoCobro,
    sesionActivaId,
    setDestinoCobro,
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
  } = useGastoWizardStore()
  const { metodos, isLoading: loadingMetodos } = useMetodosCxP()
  const [sesionActivaHora, setSesionActivaHora] = useState<string | null>(null)

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

  const { montoProveedorUsd, totalAbonadoProveedorUsd, saldoPendienteProveedor, pagosSuperanTotal } =
    useGastoTotales({
      monedaFactura,
      usaTasaParalela,
      tasaInterna,
      tasaProveedor,
      montoFactura,
      tipoImpuesto,
      porcentajeIva,
      pagos,
    })

  function handleMetodoChange(pagoId: string, metodoId: string) {
    const metodo = metodos.find((m) => m.id === metodoId)
    actualizarPago(pagoId, 'metodo_cobro_id', metodoId)
    actualizarPago(pagoId, 'banco_empresa_id', metodo?.banco_empresa_id ?? '')
    actualizarPago(pagoId, 'moneda', metodo?.moneda ?? 'USD')
    actualizarPago(pagoId, 'monto', '')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Abonos
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            (opcional — dejar vacío para registrar a crédito)
          </span>
        </p>
        <button
          type="button"
          onClick={agregarPago}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar abono
        </button>
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
            Sin abonos — el gasto quedará pendiente en Cuentas por Pagar
          </p>
        </div>
      )}

      <div className="space-y-3">
        {pagos.map((pago, index) => {
          const metodoSeleccionado = metodos.find((m) => m.id === pago.metodo_cobro_id)
          const requiereReferencia = metodoSeleccionado?.requiere_referencia === 1

          return (
            <div key={pago.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Abono {index + 1}</span>
                <button
                  type="button"
                  onClick={() => eliminarPago(pago.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Eliminar abono"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>

              <select
                value={pago.metodo_cobro_id}
                onChange={(e) => handleMetodoChange(pago.id, e.target.value)}
                disabled={loadingMetodos}
                className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{loadingMetodos ? 'Cargando...' : 'Seleccionar método'}</option>
                {metodos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.moneda})
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0.01"
                value={pago.monto}
                onChange={(e) => actualizarPago(pago.id, 'monto', e.target.value)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder={`Monto ${pago.moneda}`}
                className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
              />

              {requiereReferencia && (
                <input
                  type="text"
                  value={pago.referencia}
                  onChange={(e) => actualizarPago(pago.id, 'referencia', e.target.value.toUpperCase())}
                  placeholder="Nro de referencia"
                  className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              )}
            </div>
          )
        })}
      </div>

      {pagos.length > 0 && montoProveedorUsd !== null && montoProveedorUsd > 0 && (
        <div
          className={`rounded-md px-3 py-2 text-xs flex justify-between items-center ${
            pagosSuperanTotal
              ? 'bg-destructive/10 border border-destructive/30 text-destructive'
              : saldoPendienteProveedor < 0.01
                ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
                : 'bg-muted/50 border border-border text-muted-foreground'
          }`}
        >
          <span>Abonado: {formatUsd(totalAbonadoProveedorUsd)}</span>
          <span className="font-semibold text-foreground">Total: {formatUsd(montoProveedorUsd)}</span>
          <span className={pagosSuperanTotal ? 'font-medium' : ''}>
            {pagosSuperanTotal ? (
              <span className="inline-flex items-center gap-1">
                <Warning className="h-3.5 w-3.5" />
                Excede {formatUsd(totalAbonadoProveedorUsd - montoProveedorUsd)}
              </span>
            ) : saldoPendienteProveedor < 0.01 ? (
              'Cancelado'
            ) : (
              `Pendiente: ${formatUsd(saldoPendienteProveedor)}`
            )}
          </span>
        </div>
      )}
    </div>
  )
}
