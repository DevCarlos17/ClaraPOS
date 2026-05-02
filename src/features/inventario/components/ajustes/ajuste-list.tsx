import { useState } from 'react'
import { Plus, Printer } from '@phosphor-icons/react'
import { useAjustes } from '@/features/inventario/hooks/use-ajustes'
import { formatDate } from '@/lib/format'
import { formatUsd } from '@/lib/currency'
import { AjusteForm } from './ajuste-form'
import { AjusteDetalleModal } from './ajuste-detalle-modal'

function OperacionBadge({ operacion }: { operacion: string | null }) {
  if (operacion === 'SUMA') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        SUMA
      </span>
    )
  }
  if (operacion === 'NEUTRO') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
        NEUTRO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      RESTA
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'BORRADOR':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
          BORRADOR
        </span>
      )
    case 'APLICADO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
          APLICADO
        </span>
      )
    case 'ANULADO':
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
          ANULADO
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
          {status}
        </span>
      )
  }
}

interface AjusteListProps {
  ocultarNuevo?: boolean
}

export function AjusteList({ ocultarNuevo = false }: AjusteListProps) {
  const { ajustes, isLoading } = useAjustes()
  const [formOpen, setFormOpen] = useState(false)
  const [detalleAjusteId, setDetalleAjusteId] = useState<string | null>(null)

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const filas = ajustes
      .map((a) => `<tr>
        <td style="font-family:monospace">${a.num_ajuste}</td>
        <td>${formatDate(a.fecha)}</td>
        <td>${a.nombre_motivo ?? '-'}</td>
        <td style="text-align:center">${a.operacion_base ?? '-'}</td>
        <td style="text-align:center">${a.status}</td>
        <td style="text-align:center">${a.items_count ?? 0}</td>
        <td style="text-align:right">${formatUsd(a.total_usd ?? 0)}</td>
      </tr>`)
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Ajustes de Inventario</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p { margin: 2px 0 12px; color: #666; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Historial de Ajustes de Inventario</h1>
  <p>Total: ${ajustes.length} ajustes &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Num Ajuste</th>
        <th>Fecha</th>
        <th>Motivo</th>
        <th style="text-align:center">Operacion</th>
        <th style="text-align:center">Status</th>
        <th style="text-align:center">Items</th>
        <th style="text-align:right">Total (USD)</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card shadow-md p-6 space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-56 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card shadow-md p-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">Ajustes de Inventario</h2>
        <div className="flex gap-2">
          <button
            onClick={handleReporte}
            disabled={ajustes.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Reporte
          </button>
          {!ocultarNuevo && (
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nuevo Ajuste
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      {ajustes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay ajustes registrados</p>
          <p className="text-sm mt-1">Crea el primer ajuste para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Num Ajuste</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motivo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operacion</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Items</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total (USD)</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {ajustes.map((ajuste) => (
                <tr
                  key={ajuste.id}
                  onClick={() => setDetalleAjusteId(ajuste.id)}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono font-medium">
                    {ajuste.num_ajuste}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(ajuste.fecha)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ajuste.nombre_motivo ?? '-'}</td>
                  <td className="px-4 py-3">
                    <OperacionBadge operacion={ajuste.operacion_base} />
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {ajuste.items_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatUsd(ajuste.total_usd ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ajuste.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AjusteForm isOpen={formOpen} onClose={() => setFormOpen(false)} />

      {detalleAjusteId && (
        <AjusteDetalleModal
          isOpen={detalleAjusteId !== null}
          onClose={() => setDetalleAjusteId(null)}
          ajusteId={detalleAjusteId}
        />
      )}
    </div>
  )
}
