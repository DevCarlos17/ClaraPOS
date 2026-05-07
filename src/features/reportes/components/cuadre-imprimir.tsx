import { useQuery } from '@powersync/react'
import { usePagosPorMetodo, type CuadreFilters } from '../hooks/use-cuadre'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'

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
}: CuadreImprimirProps) {
  const { metodos } = usePagosPorMetodo(filters)

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
                const fisicoUsd =
                  fisicoNativo !== undefined
                    ? m.moneda === 'BS' && tasaDelDia > 0
                      ? fisicoNativo / tasaDelDia
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
