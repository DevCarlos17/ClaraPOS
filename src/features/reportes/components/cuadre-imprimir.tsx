import { useQuery } from '@powersync/react'
import {
  usePagosPorMetodo,
  useTotalesFiscales,
  useIvaPorAlicuota,
  usePagosDetalleCompleto,
  useVentasAudit,
  type CuadreFilters,
} from '../hooks/use-cuadre'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'

interface PrintOptions {
  desgloseFiscal: boolean
  detalleTransferencias: boolean
  listaFacturas: boolean
}

interface CuadreImprimirProps {
  filters: CuadreFilters
  tasaDelDia: number
  totalVentasUsd: number
  totalVentasBs: number
  facturasCount: number
  cxcTotalUsd: number
  totalSistemaUsd: number
  totalFisicoUsd: number
  diferencia: number
  conteoFisicoRecord: Record<string, number>
  printOptions?: PrintOptions
}

export function CuadreImprimir({
  filters,
  tasaDelDia,
  totalVentasUsd,
  totalVentasBs,
  facturasCount,
  cxcTotalUsd,
  totalSistemaUsd,
  totalFisicoUsd,
  diferencia,
  conteoFisicoRecord,
  printOptions = { desgloseFiscal: true, detalleTransferencias: false, listaFacturas: false },
}: CuadreImprimirProps) {
  const { metodos } = usePagosPorMetodo(filters)
  const { totales } = useTotalesFiscales(printOptions.desgloseFiscal ? filters : null)
  const { alicuotas } = useIvaPorAlicuota(printOptions.desgloseFiscal ? filters : null)
  const { pagos: todosPagos } = usePagosDetalleCompleto(printOptions.detalleTransferencias ? filters : null)
  const pagosTransf = todosPagos.filter((p) => p.metodoTipo !== 'EFECTIVO')
  const { ventas } = useVentasAudit(printOptions.listaFacturas ? filters : null)

  const sesionId = filters.sesionCajaIds.length === 1 ? filters.sesionCajaIds[0] : null
  const { data: sesionRaw } = useQuery(
    sesionId
      ? `SELECT sc.fecha_apertura, sc.fecha_cierre, sc.monto_apertura_usd, sc.monto_apertura_bs,
                sc.observaciones_cierre, u.nombre AS usuario_cierre_nombre, c.nombre AS caja_nombre
         FROM sesiones_caja sc
         LEFT JOIN usuarios u ON sc.usuario_cierre_id = u.id
         LEFT JOIN cajas c ON sc.caja_id = c.id
         WHERE sc.id = ?`
      : '',
    sesionId ? [sesionId] : []
  )

  type SesionRow = {
    fecha_apertura: string
    fecha_cierre: string | null
    monto_apertura_usd: string
    monto_apertura_bs: string
    observaciones_cierre: string | null
    usuario_cierre_nombre: string | null
    caja_nombre: string | null
  }
  const sesion = ((sesionRaw ?? []) as SesionRow[])[0]

  const resultado =
    diferencia > 0.001
      ? 'SOBRANTE'
      : diferencia < -0.001
      ? 'FALTANTE'
      : 'CUADRADO'

  return (
    <div className="hidden print:block text-[13px] font-sans leading-snug">
      {/* Encabezado */}
      <div className="text-center mb-6 border-b pb-4">
        <h1 className="text-xl font-bold tracking-wide">CUADRE DE CAJA</h1>
        {sesion?.caja_nombre && (
          <p className="text-sm font-medium mt-1">{sesion.caja_nombre}</p>
        )}
        <p className="text-sm text-gray-600">Fecha: {filters.fecha}</p>
        <p className="text-xs text-gray-400 mt-1">
          Generado: {new Date().toLocaleString('es-VE')}
        </p>
      </div>

      {/* Info de sesion */}
      {sesion && (
        <div className="mb-5 grid grid-cols-2 gap-4 border rounded p-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Apertura</p>
            <p className="font-semibold">{formatDateTime(sesion.fecha_apertura)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Fondo: USD {parseFloat(sesion.monto_apertura_usd).toFixed(2)}
              {parseFloat(sesion.monto_apertura_bs) > 0 && (
                <> + Bs {parseFloat(sesion.monto_apertura_bs).toFixed(2)}</>
              )}
            </p>
          </div>
          {sesion.fecha_cierre ? (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Cierre</p>
              <p className="font-semibold">{formatDateTime(sesion.fecha_cierre)}</p>
              {sesion.usuario_cierre_nombre && (
                <p className="text-xs text-gray-500 mt-0.5">Por: {sesion.usuario_cierre_nombre}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Estado</p>
              <p className="font-semibold text-green-700">ABIERTA</p>
            </div>
          )}
        </div>
      )}

      {/* Resumen del dia */}
      <div className="mb-5 border rounded p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Resumen del Dia
        </p>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-0.5">Total Ventas ({facturasCount} facturas)</td>
              <td className="text-right font-mono">{formatUsd(totalVentasUsd)}</td>
              <td className="text-right font-mono pl-3">{formatBs(totalVentasBs)}</td>
            </tr>
            {cxcTotalUsd > 0.001 && (
              <tr>
                <td className="py-0.5 text-red-700">Cuentas por Cobrar pendientes</td>
                <td className="text-right font-mono text-red-700">{formatUsd(cxcTotalUsd)}</td>
                <td />
              </tr>
            )}
            {tasaDelDia > 0 && (
              <tr className="border-t">
                <td className="py-0.5 text-gray-500">Tasa del dia</td>
                <td colSpan={2} className="text-right font-mono">
                  {formatTasa(tasaDelDia)} Bs/$
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Desglose Fiscal (opcional) */}
      {printOptions.desgloseFiscal && totales && (
        <div className="mb-5 border rounded p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Desglose Fiscal
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="text-left py-1 font-medium">Concepto</th>
                <th className="text-right py-1 font-medium">USD</th>
                <th className="text-right py-1 font-medium pl-3">Bs.</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-0.5">Base imponible</td>
                <td className="text-right font-mono">{formatUsd(totales.baseImponibleUsd)}</td>
                <td className="text-right font-mono pl-3">{formatBs(totales.baseImponibleBs)}</td>
              </tr>
              {totales.totalExentoUsd > 0.001 && (
                <tr>
                  <td className="py-0.5">Exentos</td>
                  <td className="text-right font-mono">{formatUsd(totales.totalExentoUsd)}</td>
                  <td className="text-right font-mono pl-3">{formatBs(totales.totalExentoBs)}</td>
                </tr>
              )}
              {/* IVA por alicuota */}
              {alicuotas.map((a) => (
                <tr key={a.impuestoPct}>
                  <td className="py-0.5 text-gray-600">IVA {a.impuestoPct}%</td>
                  <td className="text-right font-mono">{formatUsd(a.montoIvaUsd)}</td>
                  <td className="text-right font-mono pl-3">{formatBs(a.montoIvaBs)}</td>
                </tr>
              ))}
              {totales.totalIgtfUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">IGTF</td>
                  <td className="text-right font-mono">{formatUsd(totales.totalIgtfUsd)}</td>
                  <td className="text-right font-mono pl-3">{formatBs(totales.totalIgtfBs)}</td>
                </tr>
              )}
              {totales.totalDescuentoUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">Descuentos</td>
                  <td className="text-right font-mono text-red-700">-{formatUsd(totales.totalDescuentoUsd)}</td>
                  <td className="text-right font-mono pl-3 text-red-700">-{formatBs(totales.totalDescuentoBs)}</td>
                </tr>
              )}
              {totales.totalNcrUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">Notas de Credito</td>
                  <td className="text-right font-mono text-red-700">-{formatUsd(totales.totalNcrUsd)}</td>
                  <td className="text-right font-mono pl-3 text-red-700">-{formatBs(totales.totalNcrBs)}</td>
                </tr>
              )}
              <tr className="border-t font-bold">
                <td className="py-1">Total Facturado</td>
                <td className="text-right font-mono">{formatUsd(totales.totalFacturadoUsd)}</td>
                <td className="text-right font-mono pl-3">{formatBs(totales.totalFacturadoBs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Conteo por metodo */}
      {metodos.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Conteo por Metodo de Pago
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y bg-gray-50">
                <th className="text-left py-1.5 px-2 font-semibold">Metodo</th>
                <th className="text-right py-1.5 px-2 font-semibold">Sistema</th>
                <th className="text-right py-1.5 px-2 font-semibold">Fisico</th>
                <th className="text-right py-1.5 px-2 font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {metodos.map((m) => {
                const fisicoNativo = conteoFisicoRecord[m.metodo_cobro_id]
                const efectivaTasa = tasaDelDia > 0
                  ? tasaDelDia
                  : m.totalOriginal > 0 && m.totalUsd > 0
                  ? m.totalOriginal / m.totalUsd
                  : 0
                const fisicoUsd =
                  fisicoNativo !== undefined
                    ? m.moneda === 'BS' && efectivaTasa > 0
                      ? fisicoNativo / efectivaTasa
                      : fisicoNativo
                    : null
                const dif =
                  fisicoUsd !== null ? Number((fisicoUsd - m.totalUsd).toFixed(2)) : null
                return (
                  <tr key={m.metodo_cobro_id} className="border-b">
                    <td className="py-1 px-2">{m.nombre}</td>
                    <td className="py-1 px-2 text-right font-mono">
                      {m.moneda === 'BS' ? formatBs(m.totalOriginal) : formatUsd(m.totalUsd)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {fisicoNativo !== undefined
                        ? m.moneda === 'BS'
                          ? formatBs(fisicoNativo)
                          : formatUsd(fisicoNativo)
                        : '—'}
                    </td>
                    <td
                      className={`py-1 px-2 text-right font-mono ${
                        dif === null
                          ? ''
                          : dif > 0.001
                          ? 'text-green-700'
                          : dif < -0.001
                          ? 'text-red-700'
                          : ''
                      }`}
                    >
                      {dif !== null ? `${dif > 0 ? '+' : ''}${formatUsd(dif)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-1.5 px-2">TOTAL</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatUsd(totalSistemaUsd)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatUsd(totalFisicoUsd)}</td>
                <td
                  className={`py-1.5 px-2 text-right font-mono ${
                    diferencia > 0.001
                      ? 'text-green-700'
                      : diferencia < -0.001
                      ? 'text-red-700'
                      : ''
                  }`}
                >
                  {diferencia > 0 ? '+' : ''}
                  {formatUsd(diferencia)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Resultado final */}
      <div className="mb-5 border-2 rounded p-4 text-center">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
          Resultado del Cuadre
        </p>
        <p
          className={`text-2xl font-bold ${
            resultado === 'SOBRANTE'
              ? 'text-green-700'
              : resultado === 'FALTANTE'
              ? 'text-red-700'
              : 'text-gray-800'
          }`}
        >
          {resultado}
        </p>
        <p className="font-mono text-lg mt-0.5">
          {diferencia > 0 ? '+' : ''}
          {formatUsd(diferencia)}
        </p>
      </div>

      {/* Observaciones */}
      {sesion?.observaciones_cierre && (
        <div className="mb-5 border rounded p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Observaciones
          </p>
          <p className="text-sm">{sesion.observaciones_cierre}</p>
        </div>
      )}

      {/* Detalle de transferencias (opcional) */}
      {printOptions.detalleTransferencias && pagosTransf.length > 0 && (
        <div className="mb-5 break-before-page">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Detalle de Transferencias ({pagosTransf.length})
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y bg-gray-50">
                <th className="text-left py-1 px-2 font-semibold">Hora</th>
                <th className="text-left py-1 px-2 font-semibold">Factura</th>
                <th className="text-left py-1 px-2 font-semibold">Cliente</th>
                <th className="text-left py-1 px-2 font-semibold">Metodo</th>
                <th className="text-left py-1 px-2 font-semibold">Referencia</th>
                <th className="text-right py-1 px-2 font-semibold">Monto</th>
                <th className="text-right py-1 px-2 font-semibold">USD</th>
              </tr>
            </thead>
            <tbody>
              {pagosTransf.map((p) => {
                const hora = (() => {
                  try {
                    const parts = p.fecha.split(' ')
                    return parts.length >= 2 ? parts[1].substring(0, 5) : ''
                  } catch { return '' }
                })()
                return (
                  <tr key={p.id} className="border-b">
                    <td className="py-0.5 px-2 text-gray-500">{hora}</td>
                    <td className="py-0.5 px-2 font-mono">{p.nroFactura ? `#${p.nroFactura}` : '—'}</td>
                    <td className="py-0.5 px-2">{p.clienteNombre ?? '—'}</td>
                    <td className="py-0.5 px-2">{p.metodoNombre}</td>
                    <td className="py-0.5 px-2 text-gray-500">{p.referencia ?? '—'}</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {p.moneda === 'BS' ? formatBs(parseFloat(p.monto)) : formatUsd(parseFloat(p.monto))}
                    </td>
                    <td className="py-0.5 px-2 text-right font-mono font-bold">
                      {formatUsd(parseFloat(p.montoUsd))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={6} className="py-1 px-2">Total</td>
                <td className="py-1 px-2 text-right font-mono">
                  {formatUsd(pagosTransf.reduce((s, p) => s + parseFloat(p.montoUsd), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Lista de facturas (opcional) */}
      {printOptions.listaFacturas && ventas.length > 0 && (
        <div className="mb-5 break-before-page">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Lista de Facturas ({ventas.length})
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y bg-gray-50">
                <th className="text-left py-1 px-2 font-semibold">Factura</th>
                <th className="text-left py-1 px-2 font-semibold">Cliente</th>
                <th className="text-left py-1 px-2 font-semibold">Tipo</th>
                <th className="text-right py-1 px-2 font-semibold">Total USD</th>
                <th className="text-right py-1 px-2 font-semibold">Total Bs.</th>
                <th className="text-left py-1 px-2 font-semibold">Metodos</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className={`border-b ${v.status === 'ANULADA' ? 'line-through text-gray-400' : ''}`}>
                  <td className="py-0.5 px-2 font-mono">#{v.nro_factura}</td>
                  <td className="py-0.5 px-2">{v.cliente_nombre}</td>
                  <td className="py-0.5 px-2">{v.tipo}</td>
                  <td className="py-0.5 px-2 text-right font-mono">{formatUsd(parseFloat(v.total_usd))}</td>
                  <td className="py-0.5 px-2 text-right font-mono">{formatBs(parseFloat(v.total_bs))}</td>
                  <td className="py-0.5 px-2 text-gray-500">{v.metodos_pago ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={3} className="py-1 px-2">Total</td>
                <td className="py-1 px-2 text-right font-mono">
                  {formatUsd(ventas.filter(v => v.status !== 'ANULADA').reduce((s, v) => s + parseFloat(v.total_usd), 0))}
                </td>
                <td className="py-1 px-2 text-right font-mono">
                  {formatBs(ventas.filter(v => v.status !== 'ANULADA').reduce((s, v) => s + parseFloat(v.total_bs), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Firmas */}
      <div className="mt-12 grid grid-cols-2 gap-16">
        <div className="text-center">
          <div className="border-t border-black pt-2">
            <p className="text-xs font-medium">Responsable de Caja</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-black pt-2">
            <p className="text-xs font-medium">Supervisor / Gerente</p>
          </div>
        </div>
      </div>
    </div>
  )
}
