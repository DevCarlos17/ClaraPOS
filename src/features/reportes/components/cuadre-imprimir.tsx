import { useQuery } from '@powersync/react'
import {
  usePagosPorMetodo,
  useTotalesFiscales,
  useIvaPorAlicuota,
  usePagosDetalleCompleto,
  useVentasAudit,
  type CuadreFilters,
} from '../hooks/use-cuadre'
import { useCurrentUser } from '@/core/hooks/use-current-user'
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
  cajeroNombre?: string
  supervisorNombre?: string
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
  cajeroNombre,
  supervisorNombre,
  printOptions = { desgloseFiscal: true, detalleTransferencias: false, listaFacturas: false },
}: CuadreImprimirProps) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { metodos } = usePagosPorMetodo(filters)
  const { totales } = useTotalesFiscales(printOptions.desgloseFiscal ? filters : null)
  const { alicuotas } = useIvaPorAlicuota(printOptions.desgloseFiscal ? filters : null)
  const { pagos: todosPagos } = usePagosDetalleCompleto(printOptions.detalleTransferencias ? filters : null)
  const pagosTransf = todosPagos.filter((p) => p.metodoTipo !== 'EFECTIVO')
  const { ventas } = useVentasAudit(printOptions.listaFacturas ? filters : null)

  // Empresa
  const { data: empresaRaw } = useQuery(
    empresaId ? `SELECT nombre, rif FROM empresas WHERE id = ? LIMIT 1` : '',
    empresaId ? [empresaId] : []
  )
  const empresa = ((empresaRaw ?? []) as { nombre: string; rif: string | null }[])[0]

  // Sesion
  const sesionId = filters.sesionCajaIds.length === 1 ? filters.sesionCajaIds[0] : null
  const { data: sesionRaw } = useQuery(
    sesionId
      ? `SELECT sc.fecha_apertura, sc.fecha_cierre, sc.monto_apertura_usd, sc.monto_apertura_bs,
                sc.observaciones_cierre,
                ua.nombre AS usuario_apertura_nombre,
                uc.nombre AS usuario_cierre_nombre,
                c.nombre AS caja_nombre
         FROM sesiones_caja sc
         LEFT JOIN usuarios ua ON sc.usuario_apertura_id = ua.id
         LEFT JOIN usuarios uc ON sc.usuario_cierre_id = uc.id
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
    usuario_apertura_nombre: string | null
    usuario_cierre_nombre: string | null
    caja_nombre: string | null
  }
  const sesion = ((sesionRaw ?? []) as SesionRow[])[0]

  // Nombres definitivos: props tienen prioridad, luego los de la sesion
  const nombreCajero = cajeroNombre ?? sesion?.usuario_apertura_nombre ?? '—'
  const nombreSupervisor = supervisorNombre ?? sesion?.usuario_cierre_nombre ?? '—'

  // Totales de efectivo por moneda para el conteo de billetes
  const efectivoUsd = metodos
    .filter((m) => m.tipo === 'EFECTIVO' && m.moneda !== 'BS')
    .reduce((sum, m) => {
      const nativo = conteoFisicoRecord[m.metodo_cobro_id]
      return sum + (nativo ?? 0)
    }, 0)
  const efectivoBs = metodos
    .filter((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')
    .reduce((sum, m) => {
      const nativo = conteoFisicoRecord[m.metodo_cobro_id]
      return sum + (nativo ?? 0)
    }, 0)
  const hayEfectivo = efectivoUsd > 0.001 || efectivoBs > 0.001

  const totalCobradoUsd = totalSistemaUsd
  const totalFacturadoUsd = totalVentasUsd > 0 ? totalVentasUsd : totalCobradoUsd + cxcTotalUsd

  const resultado =
    diferencia > 0.001 ? 'SOBRANTE' : diferencia < -0.001 ? 'FALTANTE' : 'CUADRADO'

  return (
    <div className="hidden print:block text-[12px] font-sans leading-normal text-gray-900">

      {/* ── ENCABEZADO ───────────────────────────────────────── */}
      <div className="mb-4 pb-3 border-b-2 border-gray-800">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">
              {empresa?.nombre ?? 'Empresa'}
            </h1>
            {empresa?.rif && (
              <p className="text-xs text-gray-600">RIF: {empresa.rif}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-base font-bold uppercase">Cuadre de Caja</p>
            {sesion?.caja_nombre && (
              <p className="text-xs text-gray-600">{sesion.caja_nombre}</p>
            )}
            <p className="text-xs text-gray-600 mt-0.5">
              Fecha: <span className="font-semibold">{filters.fecha}</span>
              {tasaDelDia > 0 && (
                <> &nbsp;·&nbsp; Tasa: <span className="font-semibold">{formatTasa(tasaDelDia)} Bs/$</span></>
              )}
            </p>
          </div>
        </div>

        {/* Cajero / Supervisor / Horario */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs border-t pt-2">
          <div>
            <span className="text-gray-500 uppercase tracking-wide">Cajero: </span>
            <span className="font-semibold">{nombreCajero}</span>
          </div>
          <div>
            <span className="text-gray-500 uppercase tracking-wide">Supervisor: </span>
            <span className="font-semibold">{nombreSupervisor}</span>
          </div>
          <div className="text-right">
            {sesion?.fecha_apertura && (
              <>
                <span className="text-gray-500">Apertura: </span>
                <span className="font-semibold">{formatDateTime(sesion.fecha_apertura)}</span>
              </>
            )}
            {sesion?.fecha_cierre && (
              <>
                <span className="ml-2 text-gray-500">Cierre: </span>
                <span className="font-semibold">{formatDateTime(sesion.fecha_cierre)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── RESUMEN FINANCIERO ───────────────────────────────── */}
      <div className="mb-4 border rounded p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
          Resumen Financiero
        </p>
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="py-0.5 text-gray-500">Total facturado ({facturasCount} facturas)</td>
              <td className="text-right font-mono">{formatUsd(totalFacturadoUsd)}</td>
              <td className="text-right font-mono pl-4">{formatBs(totalVentasBs)}</td>
            </tr>
            {cxcTotalUsd > 0.001 && (
              <tr>
                <td className="py-0.5 text-red-600 pl-3">– A crédito (CxC pendiente)</td>
                <td className="text-right font-mono text-red-600">–{formatUsd(cxcTotalUsd)}</td>
                <td />
              </tr>
            )}
            <tr className="border-t font-bold">
              <td className="py-1">Total cobrado</td>
              <td className="text-right font-mono">{formatUsd(totalCobradoUsd)}</td>
              <td className="text-right font-mono pl-4">{formatBs(totalVentasBs - (cxcTotalUsd * (tasaDelDia || 1)))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── DESGLOSE FISCAL (opcional) ───────────────────────── */}
      {printOptions.desgloseFiscal && totales && (
        <div className="mb-4 border rounded p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Desglose Fiscal
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-0.5 font-medium">Concepto</th>
                <th className="text-right py-0.5 font-medium">USD</th>
                <th className="text-right py-0.5 font-medium pl-4">Bs.</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-0.5">Base imponible</td>
                <td className="text-right font-mono">{formatUsd(totales.baseImponibleUsd)}</td>
                <td className="text-right font-mono pl-4">{formatBs(totales.baseImponibleBs)}</td>
              </tr>
              {totales.totalExentoUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">Exentos</td>
                  <td className="text-right font-mono">{formatUsd(totales.totalExentoUsd)}</td>
                  <td className="text-right font-mono pl-4">{formatBs(totales.totalExentoBs)}</td>
                </tr>
              )}
              {alicuotas.map((a) => (
                <tr key={a.impuestoPct}>
                  <td className="py-0.5 text-gray-600">IVA {a.impuestoPct}%</td>
                  <td className="text-right font-mono">{formatUsd(a.montoIvaUsd)}</td>
                  <td className="text-right font-mono pl-4">{formatBs(a.montoIvaBs)}</td>
                </tr>
              ))}
              {totales.totalIgtfUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">IGTF</td>
                  <td className="text-right font-mono">{formatUsd(totales.totalIgtfUsd)}</td>
                  <td className="text-right font-mono pl-4">{formatBs(totales.totalIgtfBs)}</td>
                </tr>
              )}
              {totales.totalDescuentoUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">Descuentos</td>
                  <td className="text-right font-mono text-red-700">–{formatUsd(totales.totalDescuentoUsd)}</td>
                  <td className="text-right font-mono pl-4 text-red-700">–{formatBs(totales.totalDescuentoBs)}</td>
                </tr>
              )}
              {totales.totalNcrUsd > 0.001 && (
                <tr>
                  <td className="py-0.5 text-gray-600">Notas de Crédito</td>
                  <td className="text-right font-mono text-red-700">–{formatUsd(totales.totalNcrUsd)}</td>
                  <td className="text-right font-mono pl-4 text-red-700">–{formatBs(totales.totalNcrBs)}</td>
                </tr>
              )}
              <tr className="border-t font-bold">
                <td className="py-1">Total Facturado</td>
                <td className="text-right font-mono">{formatUsd(totales.totalFacturadoUsd)}</td>
                <td className="text-right font-mono pl-4">{formatBs(totales.totalFacturadoBs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── CONTEO POR MÉTODO DE PAGO ────────────────────────── */}
      {metodos.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Conteo por Método de Pago
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-y">
                <th className="text-left py-1.5 px-2 font-semibold">Método</th>
                <th className="text-right py-1.5 px-2 font-semibold">Sistema</th>
                <th className="text-right py-1.5 px-2 font-semibold">Físico</th>
                <th className="text-right py-1.5 px-2 font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {metodos.map((m) => {
                const fisicoNativo = conteoFisicoRecord[m.metodo_cobro_id]
                const efectivaTasa =
                  tasaDelDia > 0
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
                const dif = fisicoUsd !== null ? Number((fisicoUsd - m.totalUsd).toFixed(2)) : null
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
                        dif === null ? '' : dif > 0.001 ? 'text-green-700' : dif < -0.001 ? 'text-red-700' : ''
                      }`}
                    >
                      {dif !== null ? `${dif > 0 ? '+' : ''}${formatUsd(dif)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-gray-50">
                <td className="py-1.5 px-2">TOTAL</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatUsd(totalSistemaUsd)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatUsd(totalFisicoUsd)}</td>
                <td
                  className={`py-1.5 px-2 text-right font-mono font-bold ${
                    diferencia > 0.001 ? 'text-green-700' : diferencia < -0.001 ? 'text-red-700' : ''
                  }`}
                >
                  {diferencia > 0 ? '+' : ''}{formatUsd(diferencia)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── EFECTIVO EN CAJA (billetes) ──────────────────────── */}
      {hayEfectivo && (
        <div className="mb-4 border rounded p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Efectivo Físico en Caja
          </p>
          <div className="flex gap-8 text-xs">
            {efectivoUsd > 0.001 && (
              <div>
                <span className="text-gray-500">Billetes USD: </span>
                <span className="font-bold font-mono">{formatUsd(efectivoUsd)}</span>
              </div>
            )}
            {efectivoBs > 0.001 && (
              <div>
                <span className="text-gray-500">Billetes Bs: </span>
                <span className="font-bold font-mono">{formatBs(efectivoBs)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RESULTADO ────────────────────────────────────────── */}
      <div className="mb-4 border-2 rounded p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Resultado del Cuadre
          </p>
          <p
            className={`text-xl font-bold mt-0.5 ${
              resultado === 'SOBRANTE'
                ? 'text-green-700'
                : resultado === 'FALTANTE'
                ? 'text-red-700'
                : 'text-gray-800'
            }`}
          >
            {resultado}
          </p>
        </div>
        <p className={`font-mono text-2xl font-bold ${
          diferencia > 0.001 ? 'text-green-700' : diferencia < -0.001 ? 'text-red-700' : 'text-gray-600'
        }`}>
          {diferencia > 0 ? '+' : ''}{formatUsd(diferencia)}
        </p>
      </div>

      {/* ── OBSERVACIONES ────────────────────────────────────── */}
      {sesion?.observaciones_cierre && (
        <div className="mb-4 border rounded p-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            Observaciones
          </p>
          <p>{sesion.observaciones_cierre}</p>
        </div>
      )}

      {/* ── DETALLE TRANSFERENCIAS (opcional) ───────────────── */}
      {printOptions.detalleTransferencias && pagosTransf.length > 0 && (
        <div className="mb-4 break-before-page">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Detalle de Transferencias ({pagosTransf.length})
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-y">
                <th className="text-left py-1 px-1.5 font-semibold">Hora</th>
                <th className="text-left py-1 px-1.5 font-semibold">Factura</th>
                <th className="text-left py-1 px-1.5 font-semibold">Cliente</th>
                <th className="text-left py-1 px-1.5 font-semibold">Método</th>
                <th className="text-left py-1 px-1.5 font-semibold">Referencia</th>
                <th className="text-right py-1 px-1.5 font-semibold">Monto</th>
                <th className="text-right py-1 px-1.5 font-semibold">USD</th>
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
                    <td className="py-0.5 px-1.5 text-gray-500">{hora}</td>
                    <td className="py-0.5 px-1.5 font-mono">{p.nroFactura ? `#${p.nroFactura}` : '—'}</td>
                    <td className="py-0.5 px-1.5">{p.clienteNombre ?? '—'}</td>
                    <td className="py-0.5 px-1.5">{p.metodoNombre}</td>
                    <td className="py-0.5 px-1.5 text-gray-500">{p.referencia ?? '—'}</td>
                    <td className="py-0.5 px-1.5 text-right font-mono">
                      {p.moneda === 'BS' ? formatBs(parseFloat(p.monto)) : formatUsd(parseFloat(p.monto))}
                    </td>
                    <td className="py-0.5 px-1.5 text-right font-mono font-bold">
                      {formatUsd(parseFloat(p.montoUsd))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={6} className="py-1 px-1.5">Total</td>
                <td className="py-1 px-1.5 text-right font-mono">
                  {formatUsd(pagosTransf.reduce((s, p) => s + parseFloat(p.montoUsd), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── LISTA DE FACTURAS (opcional) ─────────────────────── */}
      {printOptions.listaFacturas && ventas.length > 0 && (
        <div className="mb-4 break-before-page">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Lista de Facturas ({ventas.length})
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-y">
                <th className="text-left py-1 px-1.5 font-semibold">Factura</th>
                <th className="text-left py-1 px-1.5 font-semibold">Cliente</th>
                <th className="text-left py-1 px-1.5 font-semibold">Tipo</th>
                <th className="text-right py-1 px-1.5 font-semibold">USD</th>
                <th className="text-right py-1 px-1.5 font-semibold">Bs.</th>
                <th className="text-left py-1 px-1.5 font-semibold">Métodos</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr
                  key={v.id}
                  className={`border-b ${v.status === 'ANULADA' ? 'line-through text-gray-400' : ''}`}
                >
                  <td className="py-0.5 px-1.5 font-mono">#{v.nro_factura}</td>
                  <td className="py-0.5 px-1.5">{v.cliente_nombre}</td>
                  <td className="py-0.5 px-1.5">{v.tipo}</td>
                  <td className="py-0.5 px-1.5 text-right font-mono">{formatUsd(parseFloat(v.total_usd))}</td>
                  <td className="py-0.5 px-1.5 text-right font-mono">{formatBs(parseFloat(v.total_bs))}</td>
                  <td className="py-0.5 px-1.5 text-gray-500">{v.metodos_pago ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={3} className="py-1 px-1.5">Total activas</td>
                <td className="py-1 px-1.5 text-right font-mono">
                  {formatUsd(ventas.filter((v) => v.status !== 'ANULADA').reduce((s, v) => s + parseFloat(v.total_usd), 0))}
                </td>
                <td className="py-1 px-1.5 text-right font-mono">
                  {formatBs(ventas.filter((v) => v.status !== 'ANULADA').reduce((s, v) => s + parseFloat(v.total_bs), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── PIE DE PÁGINA / FIRMAS ────────────────────────────── */}
      <div className="mt-10 pt-4 border-t grid grid-cols-2 gap-16 text-xs">
        <div className="text-center">
          <div className="border-t border-gray-800 pt-2 mt-8">
            <p className="font-semibold">{nombreCajero}</p>
            <p className="text-gray-500">Responsable de Caja</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-800 pt-2 mt-8">
            <p className="font-semibold">{nombreSupervisor}</p>
            <p className="text-gray-500">Supervisor / Gerente</p>
          </div>
        </div>
      </div>

      <p className="text-center text-[9px] text-gray-400 mt-4">
        Generado: {new Date().toLocaleString('es-VE')} · ClaraPOS
      </p>
    </div>
  )
}
