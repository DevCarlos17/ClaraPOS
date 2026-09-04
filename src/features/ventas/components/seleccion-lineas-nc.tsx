import { useState } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import type { LineaNcSeleccionada } from '../hooks/use-notas-credito'
import { derivarLineasNcParcial, previewMontoBsNc, type LineaFacturaParaNc } from '../utils/notas-credito-ui'
import type { TipoImpuestoLinea } from '../utils/factura-export'

/**
 * Linea de factura candidata a NC PARCIAL (Design §Decision 7, Spec
 * notas-credito-pos: "Selección de tipo de nota de crédito"). Mapeada por el
 * llamador desde `useDetalleFactura` (cxc) — este componente NUNCA hace
 * fetch propio.
 */
export interface LineaSeleccionNc {
  venta_det_id: string
  producto_nombre: string
  producto_codigo: string
  cantidadFacturada: number
  esDecimal: boolean
  precioUnitarioUsd: number
  tipoImpuesto: TipoImpuestoLinea
  impuestoPct: number
}

interface SeleccionLineasNcProps {
  lineas: LineaSeleccionNc[]
  /** Factura original — SIEMPRE `venta.tasa` historica (Design §Decision 8, invariante bimonetaria). */
  factura: { total_usd: number; total_bs: number; tasa: number }
  onConfirm: (lineas: LineaNcSeleccionada[]) => void
  loading?: boolean
}

/**
 * Componente de PRESENTACION (Slice 3b, Design §Decision 7): columna de
 * cantidad a devolver por linea, con el mismo patron de stepper es_decimal
 * de `linea-items.tsx:88-137` (paso entero/decimal, bloqueo de tecla
 * decimal). La validacion real (tope de cantidad facturada, es_decimal,
 * cantidad negativa) vive en la funcion pura `derivarLineasNcParcial` —
 * este componente solo la invoca, nunca reimplementa las reglas.
 */
export function SeleccionLineasNc({ lineas, factura, onConfirm, loading = false }: SeleccionLineasNcProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})

  function setCantidad(ventaDetId: string, cantidadFacturada: number, valor: number) {
    // Defensa en profundidad en la UI (clamp) — el guardrail real y
    // autoritativo contra negativos/excesos vive en `derivarLineasNcParcial`.
    const clamped = Math.max(0, Math.min(valor, cantidadFacturada))
    setCantidades((prev) => ({ ...prev, [ventaDetId]: clamped }))
  }

  const facturaLineasParaNc: LineaFacturaParaNc[] = lineas.map((l) => ({
    venta_det_id: l.venta_det_id,
    cantidadFacturada: l.cantidadFacturada,
    esDecimal: l.esDecimal,
  }))
  const { lineas: lineasValidas, errores } = derivarLineasNcParcial(facturaLineasParaNc, cantidades)

  const lineasSeleccionadas = lineas.filter((l) => (cantidades[l.venta_det_id] ?? 0) > 0)
  const preview = previewMontoBsNc({
    tipo: 'PARCIAL',
    factura,
    lineasSeleccionadas: lineasSeleccionadas.map((l) => ({
      codigo: l.producto_codigo,
      nombre: l.producto_nombre,
      cantidad: String(cantidades[l.venta_det_id] ?? 0),
      precioUnitarioUsd: String(l.precioUnitarioUsd),
      tipoImpuesto: l.tipoImpuesto,
      impuestoPct: l.impuestoPct,
    })),
  })

  const puedeConfirmar = !loading && errores.length === 0

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium">Producto</th>
              <th className="text-center px-2 py-1.5 font-medium w-16">Facturado</th>
              <th className="text-center px-2 py-1.5 font-medium w-32">A devolver</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea) => {
              const cantidad = cantidades[linea.venta_det_id] ?? 0
              const step = linea.esDecimal ? 0.001 : 1
              return (
                <tr key={linea.venta_det_id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5">
                    <p className="font-medium">{linea.producto_nombre}</p>
                    <p className="text-muted-foreground">{linea.producto_codigo}</p>
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">
                    {linea.cantidadFacturada.toFixed(linea.esDecimal ? 3 : 0)}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Disminuir cantidad"
                        onClick={() => setCantidad(linea.venta_det_id, linea.cantidadFacturada, cantidad - step)}
                        disabled={cantidad <= 0}
                        className="shrink-0 flex items-center justify-center h-5 w-5 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <input
                        type="number"
                        role="spinbutton"
                        min="0"
                        max={linea.cantidadFacturada}
                        step={linea.esDecimal ? 'any' : '1'}
                        value={cantidad === 0 ? '' : cantidad}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (raw === '') {
                            setCantidad(linea.venta_det_id, linea.cantidadFacturada, 0)
                            return
                          }
                          const val = linea.esDecimal ? parseFloat(raw) : parseInt(raw, 10)
                          if (!isNaN(val)) setCantidad(linea.venta_det_id, linea.cantidadFacturada, val)
                        }}
                        onKeyDown={(e) => {
                          if (!linea.esDecimal && (e.key === '.' || e.key === ',')) e.preventDefault()
                          if (e.key === '+') {
                            e.preventDefault()
                            setCantidad(linea.venta_det_id, linea.cantidadFacturada, cantidad + step)
                          }
                          if (e.key === '-') {
                            e.preventDefault()
                            setCantidad(linea.venta_det_id, linea.cantidadFacturada, cantidad - step)
                          }
                        }}
                        className="min-w-0 w-16 text-center rounded border bg-white px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="button"
                        aria-label="Incrementar cantidad"
                        onClick={() => setCantidad(linea.venta_det_id, linea.cantidadFacturada, cantidad + step)}
                        disabled={cantidad >= linea.cantidadFacturada}
                        className="shrink-0 flex items-center justify-center h-5 w-5 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {errores.length > 0 && (
        <ul className="text-xs text-destructive space-y-0.5">
          {errores.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-sm">
        <span className="text-muted-foreground">Total a devolver:</span>
        <span className="font-semibold">
          {formatUsd(preview.totalUsd)} / {formatBs(preview.totalBs)}
        </span>
      </div>

      <button
        type="button"
        disabled={!puedeConfirmar}
        onClick={() => onConfirm(lineasValidas)}
        className="w-full px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Procesando...' : 'Confirmar Nota de Credito Parcial'}
      </button>
    </div>
  )
}
