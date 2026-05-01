import { useState, useMemo } from 'react'
import { Plus, Printer } from 'lucide-react'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useLotesPorProducto } from '@/features/inventario/hooks/use-lotes'
import { formatDate } from '@/lib/format'
import { LoteForm } from './lote-form'

type LoteStatus = 'ACTIVO' | 'AGOTADO' | 'VENCIDO'

function StatusBadge({ status }: { status: string }) {
  switch (status as LoteStatus) {
    case 'ACTIVO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
          ACTIVO
        </span>
      )
    case 'AGOTADO':
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
          AGOTADO
        </span>
      )
    case 'VENCIDO':
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
          VENCIDO
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

function LotesTable({ productoId, productoNombre }: { productoId: string; productoNombre: string }) {
  const { lotes, isLoading } = useLotesPorProducto(productoId)

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const hoy = new Date()
    const diasParaVencimiento = (fechaStr: string | null) => {
      if (!fechaStr) return null
      const fecha = new Date(fechaStr)
      return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    }

    const filas = lotes
      .map((lote) => {
        const dias = diasParaVencimiento(lote.fecha_vencimiento)
        const vencStyle = dias !== null && dias < 0
          ? 'background:#fef2f2;color:#991b1b'
          : dias !== null && dias < 30
            ? 'background:#fefce8;color:#854d0e'
            : ''
        return `<tr style="${vencStyle}">
          <td style="font-family:monospace">${lote.nro_lote}</td>
          <td>${lote.nombre_deposito ?? '-'}</td>
          <td style="text-align:right">${parseFloat(lote.cantidad_inicial).toFixed(3)}</td>
          <td style="text-align:right">${parseFloat(lote.cantidad_actual).toFixed(3)}</td>
          <td style="text-align:right">${lote.costo_unitario ? `$${parseFloat(lote.costo_unitario).toFixed(2)}` : '-'}</td>
          <td>${lote.fecha_fabricacion ? formatDate(lote.fecha_fabricacion) : '-'}</td>
          <td>${lote.fecha_vencimiento ? formatDate(lote.fecha_vencimiento) : '-'}</td>
          <td style="text-align:center">${lote.status}</td>
        </tr>`
      })
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Lotes - ${productoNombre}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    h2 { font-size: 13px; color: #4b5563; margin-bottom: 4px; }
    p { margin: 2px 0 12px; color: #666; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    .leyenda { margin-top: 10px; font-size: 10px; color: #6b7280; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Reporte de Lotes</h1>
  <h2>${productoNombre}</h2>
  <p>Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Nro. Lote</th>
        <th>Deposito</th>
        <th style="text-align:right">Cant. Inicial</th>
        <th style="text-align:right">Cant. Actual</th>
        <th style="text-align:right">Costo Unit.</th>
        <th>F. Fabricacion</th>
        <th>F. Vencimiento</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <p class="leyenda">
    <span style="background:#fef2f2;padding:1px 4px">Rojo</span> = Vencido &nbsp;|&nbsp;
    <span style="background:#fefce8;padding:1px 4px">Amarillo</span> = Vence en menos de 30 dias
  </p>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-10 bg-muted rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={handleReporte}
          disabled={lotes.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          Reporte
        </button>
      </div>

      {lotes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay lotes registrados</p>
          <p className="text-sm mt-1">Crea el primer lote para este producto</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nro Lote</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deposito</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cant. Inicial</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cant. Actual</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">F. Fabricacion</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">F. Vencimiento</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((lote) => {
                const hoy = new Date()
                const diasVence = lote.fecha_vencimiento
                  ? Math.ceil((new Date(lote.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
                  : null
                const rowClass = diasVence !== null && diasVence < 0
                  ? 'border-b border-red-100 bg-red-50'
                  : diasVence !== null && diasVence < 30
                    ? 'border-b border-yellow-100 bg-yellow-50'
                    : 'border-b border-border hover:bg-muted/50'

                return (
                  <tr key={lote.id} className={`${rowClass} transition-colors`}>
                    <td className="px-4 py-3 font-mono font-medium">{lote.nro_lote}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lote.nombre_deposito ?? '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {parseFloat(lote.cantidad_inicial).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {parseFloat(lote.cantidad_actual).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {lote.costo_unitario != null ? `$${parseFloat(lote.costo_unitario).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {lote.fecha_fabricacion ? formatDate(lote.fecha_fabricacion) : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {lote.fecha_vencimiento ? formatDate(lote.fecha_vencimiento) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lote.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function LoteList() {
  const { productos, isLoading: loadingProductos } = useProductos()
  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  // Solo mostrar productos con maneja_lotes = 1
  const productosConLotes = useMemo(
    () => productos.filter((p) => p.maneja_lotes === 1 && p.tipo === 'P'),
    [productos]
  )

  const productoSeleccionado = productosConLotes.find((p) => p.id === selectedProductoId)

  return (
    <div className="rounded-xl bg-card shadow-md p-6">
      {/* Selector de producto */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[260px]">
          <label htmlFor="lote-producto-sel" className="block text-sm font-medium text-muted-foreground mb-1">
            Producto (con gestion de lotes)
          </label>
          <select
            id="lote-producto-sel"
            value={selectedProductoId}
            onChange={(e) => setSelectedProductoId(e.target.value)}
            disabled={loadingProductos}
            className="w-full rounded-md border border-input px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Seleccione un producto --</option>
            {productosConLotes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} - {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {selectedProductoId && (
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nuevo Lote
          </button>
        )}
      </div>

      {/* Contenido */}
      {!selectedProductoId ? (
        productosConLotes.length === 0 && !loadingProductos ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            <p className="text-base font-medium">No hay productos con gestion de lotes</p>
            <p className="text-sm mt-1">
              Activa la opcion <strong>Maneja Lotes</strong> en el formulario de producto para comenzar
            </p>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-base font-medium">Seleccione un producto para ver sus lotes</p>
          </div>
        )
      ) : (
        <LotesTable
          productoId={selectedProductoId}
          productoNombre={productoSeleccionado?.nombre ?? ''}
        />
      )}

      <LoteForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        productoId={selectedProductoId}
      />
    </div>
  )
}
