import { useState } from 'react'
import { useQuery } from '@powersync/react'
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd } from '@/lib/currency'

interface VencimientoCobrar {
  id: string
  venta_id: string
  cliente_nombre: string
  nro_factura: string
  nro_cuota: number
  fecha_vencimiento: string
  monto_original_usd: string
  monto_pagado_usd: string
  saldo_pendiente_usd: string
  status: string
}

type FiltroStatus = 'TODOS' | 'VENCIDO' | 'PROXIMO' | 'PENDIENTE'

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

function getDiasRestantes(fechaVenc: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVenc + 'T00:00:00')
  return Math.floor((venc.getTime() - today.getTime()) / 86400000)
}

export function PrestamosPage() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [filtro, setFiltro] = useState<FiltroStatus>('TODOS')

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT vc.id, vc.venta_id, vc.nro_cuota, vc.fecha_vencimiento,
               vc.monto_original_usd, vc.monto_pagado_usd, vc.saldo_pendiente_usd, vc.status,
               v.nro_factura,
               c.nombre as cliente_nombre
         FROM vencimientos_cobrar vc
         JOIN ventas v ON vc.venta_id = v.id
         JOIN clientes c ON vc.cliente_id = c.id
         WHERE vc.empresa_id = ?
         ORDER BY vc.fecha_vencimiento ASC`
      : '',
    empresaId ? [empresaId] : []
  )

  const todos = (data ?? []) as VencimientoCobrar[]

  const conDias = todos.map((v) => ({
    ...v,
    diasRestantes: getDiasRestantes(v.fecha_vencimiento),
  }))

  const filtrados = conDias.filter((v) => {
    if (filtro === 'TODOS') return true
    if (filtro === 'VENCIDO') return v.diasRestantes < 0 && v.status === 'PENDIENTE'
    if (filtro === 'PROXIMO') return v.diasRestantes >= 0 && v.diasRestantes <= 7 && v.status === 'PENDIENTE'
    if (filtro === 'PENDIENTE') return v.status === 'PENDIENTE'
    return true
  })

  const totalVencidos = conDias.filter((v) => v.diasRestantes < 0 && v.status === 'PENDIENTE').length
  const totalProximos = conDias.filter((v) => v.diasRestantes >= 0 && v.diasRestantes <= 7 && v.status === 'PENDIENTE').length
  const totalPendientes = conDias.filter((v) => v.status === 'PENDIENTE').length

  const filtros: { key: FiltroStatus; label: string; count: number; colorClass: string }[] = [
    { key: 'TODOS', label: 'Todos', count: todos.length, colorClass: 'bg-muted text-foreground' },
    { key: 'VENCIDO', label: 'Vencidos', count: totalVencidos, colorClass: 'bg-destructive/10 text-destructive' },
    { key: 'PROXIMO', label: 'Proximos (7 dias)', count: totalProximos, colorClass: 'bg-amber-100 text-amber-700' },
    { key: 'PENDIENTE', label: 'Pendientes', count: totalPendientes, colorClass: 'bg-blue-50 text-blue-700' },
  ]

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filtro === f.key
                ? `${f.colorClass} border-transparent`
                : 'bg-background border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f.label}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filtro === f.key ? 'bg-white/40' : 'bg-muted'}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {filtro === 'TODOS' ? 'No hay prestamos registrados' : `No hay prestamos en este filtro`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-xs">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-xs">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium text-xs">Factura</th>
                  <th className="text-left px-4 py-3 font-medium text-xs">Vencimiento</th>
                  <th className="text-right px-4 py-3 font-medium text-xs">Original</th>
                  <th className="text-right px-4 py-3 font-medium text-xs">Pagado</th>
                  <th className="text-right px-4 py-3 font-medium text-xs">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((v) => {
                  const isVencido = v.diasRestantes < 0 && v.status === 'PENDIENTE'
                  const isProximo = v.diasRestantes >= 0 && v.diasRestantes <= 7 && v.status === 'PENDIENTE'
                  const isPagado = v.status === 'PAGADO'
                  const diasAbs = Math.abs(v.diasRestantes)

                  return (
                    <tr key={v.id} className="border-b border-muted hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        {isPagado ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            <CheckCircle2 size={11} />
                            Pagado
                          </span>
                        ) : isVencido ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                              <AlertTriangle size={11} />
                              Vencido
                            </span>
                            <p className="text-xs text-destructive/70 mt-0.5">hace {diasAbs} dia{diasAbs !== 1 ? 's' : ''}</p>
                          </div>
                        ) : isProximo ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <Clock size={11} />
                              Proximo
                            </span>
                            <p className="text-xs text-amber-600/70 mt-0.5">en {diasAbs} dia{diasAbs !== 1 ? 's' : ''}</p>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{v.cliente_nombre}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{v.nro_factura}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatFecha(v.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatUsd(parseFloat(v.monto_original_usd))}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatUsd(parseFloat(v.monto_pagado_usd))}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${
                        parseFloat(v.saldo_pendiente_usd) > 0.01 ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {formatUsd(parseFloat(v.saldo_pendiente_usd))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
