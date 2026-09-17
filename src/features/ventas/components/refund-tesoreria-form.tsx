import { useState } from 'react'
import Decimal from 'decimal.js'
import { Plus, Trash } from '@phosphor-icons/react'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs, type DecimalInput } from '@/lib/currency'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'
import { useSesionesActivas } from '@/features/caja/hooks/use-sesiones-caja'
import { formatSesionId } from '@/lib/format'
import { nativoAUsd, calcularRemanenteRefund } from '@/features/ventas/utils/notas-credito-refund'
import type { EgresoTesoreriaLinea } from '../hooks/use-notas-credito'

/**
 * Sub-formulario AISLADO de "Devolver dinero -> Tesorería" (nc-refund-
 * tesoreria, Design §File Changes, Spec `notas-credito-admin` Requirement
 * "Saldo disponible visible..."). Cero DB directa: lee cuentas via
 * `useCuentasTesoreria()`, hace el calculo en vivo con las funciones puras
 * de `notas-credito-refund.ts`, y entrega el resultado al llamador via
 * `onConfirm(lineas: EgresoTesoreriaLinea[])` — la escritura real vive
 * exclusivamente en `crearNotaCredito` (motor, Slice 4).
 *
 * UI restructurada a dos selects DEPENDIENTES por linea (Origen -> Cuenta):
 * "Origen" ofrece "Tesoreria" (unica opcion habilitada) y una opcion
 * deshabilitada ("Proximamente") por cada sesion de caja ACTIVA de la
 * empresa (`useSesionesActivas()`, solo-lectura — CERO logica nueva de
 * sesiones, ver Regla de Oro). "Cuenta" depende del Origen elegido: con
 * Tesoreria lista bancos + cajas fuertes combinados (misma fuente
 * `useCuentasTesoreria()` de siempre, ya no se filtra por tipo de antemano
 * — el `destino` del egreso ahora se DERIVA del `tipo` de la cuenta
 * elegida). El branch de Sesion nunca se alcanza hoy (deshabilitada), pero
 * queda el seam para wirearlo despues sin reestructurar de nuevo.
 */

type OrigenEgreso = 'TESORERIA'

interface LineaFormState {
  key: string
  origen: OrigenEgreso
  cuentaId: string
  montoNativo: string
}

export interface RefundTesoreriaFormProps {
  /** Monto maximo reembolsable (remanente de la NC en USD, ya neto de Step A) — resuelto por el llamador (Slice 6). */
  montoDisponibleUsd: number
  /** `notas_credito.tasa_historica` — usada para convertir cuentas en Bs a USD (Spec "Conversion a tasa historica"). */
  tasaHistorica: number
  onConfirm: (lineas: EgresoTesoreriaLinea[]) => void
  loading?: boolean
}

let contadorLinea = 0
function nuevaLineaKey(): string {
  contadorLinea += 1
  return `linea-${contadorLinea}`
}

function formatEnMonedaCuenta(monto: DecimalInput, monedaCodigo: string): string {
  return monedaCodigo === 'VES' ? formatBs(monto) : formatUsd(monto)
}

export function RefundTesoreriaForm({
  montoDisponibleUsd,
  tasaHistorica,
  onConfirm,
  loading = false,
}: RefundTesoreriaFormProps) {
  const { cuentas } = useCuentasTesoreria()
  const { sesiones: sesionesActivas } = useSesionesActivas()
  const [lineas, setLineas] = useState<LineaFormState[]>([
    { key: nuevaLineaKey(), origen: 'TESORERIA', cuentaId: '', montoNativo: '' },
  ])

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { key: nuevaLineaKey(), origen: 'TESORERIA', cuentaId: '', montoNativo: '' },
    ])
  }

  function quitarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key))
  }

  function actualizarLinea(key: string, patch: Partial<LineaFormState>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function cuentaPorId(cuentaId: string) {
    return cuentas.find((c) => c.id === cuentaId)
  }

  const lineasUsd: Decimal[] = lineas.map((l) => {
    const cuenta = cuentaPorId(l.cuentaId)
    if (!cuenta || !l.montoNativo) return new Decimal(0)
    const esCuentaBs = cuenta.moneda_codigo === 'VES'
    return nativoAUsd(l.montoNativo, esCuentaBs, tasaHistorica)
  })

  const { sumaUsd, remanenteSafc, excedeTope } = calcularRemanenteRefund(montoDisponibleUsd, lineasUsd)

  const lineasCompletas = lineas.every((l) => l.cuentaId && l.montoNativo && parseFloat(l.montoNativo) > 0)
  const puedeConfirmar = !loading && lineasCompletas && !excedeTope && sumaUsd.gt(0)

  function handleConfirm() {
    if (!puedeConfirmar) return
    const egresoParams: EgresoTesoreriaLinea[] = lineas.map((l) => ({
      // `destino` se deriva de la cuenta elegida (Select 2), no de un select
      // separado — la cuenta YA sabe si es BANCO o CAJA_FUERTE.
      destino: cuentaPorId(l.cuentaId)?.tipo ?? 'BANCO',
      cuentaId: l.cuentaId,
      montoEnMonedaCuenta: l.montoNativo,
    }))
    onConfirm(egresoParams)
  }

  return (
    <div className="space-y-3">
      {lineas.map((linea) => {
        return (
          <div key={linea.key} className="rounded-lg border p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <NativeSelect
                aria-label="Origen del reembolso"
                value={linea.origen}
                onChange={(e) =>
                  actualizarLinea(linea.key, {
                    origen: e.target.value as OrigenEgreso,
                    cuentaId: '',
                  })
                }
                className="flex-1"
              >
                <option value="TESORERIA">Tesoreria</option>
                {sesionesActivas.map((s) => (
                  <option key={s.id} value={`SESION:${s.id}`} disabled>
                    {s.caja_nombre ? `Sesion ${s.caja_nombre}` : formatSesionId(s.id)} (Proximamente)
                  </option>
                ))}
              </NativeSelect>
              {lineas.length > 1 && (
                <button
                  type="button"
                  aria-label="Quitar cuenta"
                  onClick={() => quitarLinea(linea.key)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                >
                  <Trash size={14} />
                </button>
              )}
            </div>

            <NativeSelect
              aria-label="Cuenta de tesoreria"
              value={linea.cuentaId}
              onChange={(e) => actualizarLinea(linea.key, { cuentaId: e.target.value })}
            >
              <option value="">Seleccionar cuenta...</option>
              {linea.origen === 'TESORERIA' &&
                cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {formatEnMonedaCuenta(c.saldo_actual, c.moneda_codigo)} disponible
                  </option>
                ))}
              {/* TODO(nc-refund-tesoreria): cuando la Sesion de caja deje de
                  estar deshabilitada en Select 1, agregar aqui el branch que
                  liste las cuentas propias de esa sesion. */}
            </NativeSelect>

            <input
              type="number"
              aria-label="Monto"
              placeholder="Monto en la moneda de la cuenta"
              value={linea.montoNativo}
              onChange={(e) => actualizarLinea(linea.key, { montoNativo: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )
      })}

      <button
        type="button"
        onClick={agregarLinea}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md border border-dashed hover:bg-muted transition-colors"
      >
        <Plus size={12} /> Agregar cuenta
      </button>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-sm">
        <span className="text-muted-foreground">Pendiente por reembolsar:</span>
        <span className="font-semibold">{formatUsd(remanenteSafc)}</span>
      </div>

      {excedeTope && (
        <p className="text-xs text-destructive">
          El monto ingresado excede el saldo disponible de la nota de credito.
        </p>
      )}

      <button
        type="button"
        disabled={!puedeConfirmar}
        onClick={handleConfirm}
        className="w-full px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Procesando...' : 'Confirmar reembolso'}
      </button>
    </div>
  )
}
