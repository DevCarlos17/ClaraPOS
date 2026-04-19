import { useState, useMemo } from 'react'
import { Printer, Search, PackageSearch } from 'lucide-react'
import { useQuery } from '@powersync/react'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useLotesPorProducto, type Lote } from '@/features/inventario/hooks/use-lotes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatDate, formatDateTime } from '@/lib/format'

interface DespachoLote {
  id: string
  cantidad: string
  fecha: string
  origen: string
  venta_id: string | null
  nro_factura: string | null
  cliente_nombre: string | null
  cliente_rif: string | null
}

function TrazabilidadDetalleTable({
  lote,
  productoNombre,
  empresaId,
}: {
  lote: Lote
  productoNombre: string
  empresaId: string
}) {
  const { data, isLoading } = useQuery(
    `SELECT
       mi.id, mi.cantidad, mi.fecha, mi.origen, mi.venta_id,
       v.nro_factura,
       c.nombre  AS cliente_nombre,
       c.identificacion AS cliente_rif
     FROM movimientos_inventario mi
     LEFT JOIN ventas v   ON v.id = mi.venta_id
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE mi.lote_id = ? AND mi.empresa_id = ? AND mi.tipo = 'S'
     ORDER BY mi.fecha DESC`,
    [lote.id, empresaId]
  )

  const despachos = (data ?? []) as DespachoLote[]
  const totalDespachado = despachos.reduce((s, d) => s + parseFloat(d.cantidad), 0)

  function origenLabel(o: string) {
    switch (o) {
      case 'VEN': return 'Venta'
      case 'AJU': return 'Ajuste'
      case 'MAN': return 'Manual'
      default: return o
    }
  }

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const cantIni = parseFloat(lote.cantidad_inicial)
    const cantAct = parseFloat(lote.cantidad_actual)
    const consumido = cantIni - cantAct

    const filas = despachos
      .map(
        (d) => `<tr>
          <td>${d.nro_factura ?? '—'}</td>
          <td>${d.cliente_nombre ?? '—'}</td>
          <td>${d.cliente_rif ?? '—'}</td>
          <td style="text-align:right">${parseFloat(d.cantidad).toFixed(3)}</td>
          <td>${origenLabel(d.origen)}</td>
          <td>${formatDateTime(d.fecha)}</td>
        </tr>`
      )
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Trazabilidad Lote ${lote.nro_lote}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    h2 { font-size: 13px; color: #374151; margin-bottom: 4px; }
    p { margin: 2px 0; color: #6b7280; font-size: 11px; }
    .resumen { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin: 12px 0; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    .kpi-label { color: #6b7280; font-size: 10px; }
    .kpi-value { font-size: 16px; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    tfoot td { background: #f3f4f6; font-weight: 700; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Trazabilidad de Lote</h1>
  <h2>Producto: ${productoNombre}</h2>
  <p>Nro. Lote: <strong>${lote.nro_lote}</strong>
     &nbsp;|&nbsp; Deposito: ${(lote as Lote & { nombre_deposito?: string }).nombre_deposito ?? '—'}
     &nbsp;|&nbsp; Status: ${lote.status}
  </p>
  ${lote.fecha_fabricacion ? `<p>Fabricacion: ${formatDate(lote.fecha_fabricacion)}</p>` : ''}
  ${lote.fecha_vencimiento ? `<p>Vencimiento: ${formatDate(lote.fecha_vencimiento)}</p>` : ''}
  <p style="margin-top:4px">Generado: ${new Date().toLocaleString('es-VE')}</p>

  <div class="resumen">
    <div class="kpi">
      <div class="kpi-label">Cantidad inicial</div>
      <div class="kpi-value">${cantIni.toFixed(3)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Despachado</div>
      <div class="kpi-value">${consumido.toFixed(3)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Disponible</div>
      <div class="kpi-value">${cantAct.toFixed(3)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Facturas</div>
      <div class="kpi-value">${despachos.filter((d) => d.nro_factura).length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nro. Factura</th>
        <th>Cliente</th>
        <th>RIF / Cedula</th>
        <th style="text-align:right">Cantidad</th>
        <th>Origen</th>
        <th>Fecha</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">Total despachado</td>
        <td style="text-align:right">${totalDespachado.toFixed(3)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
  ${despachos.length === 0 ? '<p style="margin-top:16px;color:#6b7280">Sin despachos registrados para este lote.</p>' : ''}
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  const cantIni = parseFloat(lote.cantidad_inicial)
  const cantAct = parseFloat(lote.cantidad_actual)
  const consumido = cantIni - cantAct

  return (
    <div className="space-y-4">
      {/* Resumen del lote */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Cant. Inicial</p>
          <p className="text-lg font-bold text-gray-900">{cantIni.toFixed(3)}</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <p className="text-xs text-amber-700">Despachado</p>
          <p className="text-lg font-bold text-amber-800">{consumido.toFixed(3)}</p>
        </div>
        <div className="border border-green-200 bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-700">Disponible</p>
          <p className="text-lg font-bold text-green-800">{cantAct.toFixed(3)}</p>
        </div>
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-700">Facturas</p>
          <p className="text-lg font-bold text-blue-800">
            {despachos.filter((d) => d.nro_factura).length}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end">
        <button
          onClick={handleReporte}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Generar Reporte PDF
        </button>
      </div>

      {/* Tabla de despachos */}
      {despachos.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-lg">
          <PackageSearch className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium text-gray-500">Sin despachos registrados para este lote</p>
          <p className="text-xs mt-1">Los despachos aparecen cuando se vende un producto del lote</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-700">Nro. Factura</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-700">Cliente</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-700">RIF / Cedula</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-700">Cantidad</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-700">Origen</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-700">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {despachos.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-blue-700">
                    {d.nro_factura ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{d.cliente_nombre ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">
                    {d.cliente_rif ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                    {parseFloat(d.cantidad).toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{origenLabel(d.origen)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {formatDateTime(d.fecha)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-700">
                  Total despachado
                </td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900">
                  {totalDespachado.toFixed(3)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export function LoteTrazabilidad() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { productos, isLoading: loadingProductos } = useProductos()
  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [selectedLoteId, setSelectedLoteId] = useState('')

  const productosConLotes = useMemo(
    () => productos.filter((p) => p.maneja_lotes === 1 && p.tipo === 'P'),
    [productos]
  )

  const { lotes, isLoading: loadingLotes } = useLotesPorProducto(selectedProductoId)

  const loteSeleccionado = useMemo(
    () => lotes.find((l) => l.id === selectedLoteId) ?? null,
    [lotes, selectedLoteId]
  )

  const productoSeleccionado = productosConLotes.find((p) => p.id === selectedProductoId)

  function handleProductoChange(id: string) {
    setSelectedProductoId(id)
    setSelectedLoteId('')
  }

  return (
    <div className="space-y-4">
      {/* Selectores */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Producto
            </label>
            <select
              value={selectedProductoId}
              onChange={(e) => handleProductoChange(e.target.value)}
              disabled={loadingProductos}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccione un producto --</option>
              {productosConLotes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} - {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lote
            </label>
            <select
              value={selectedLoteId}
              onChange={(e) => setSelectedLoteId(e.target.value)}
              disabled={!selectedProductoId || loadingLotes}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">-- Seleccione un lote --</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nro_lote}
                  {l.fecha_vencimiento ? ` (vence: ${formatDate(l.fecha_vencimiento)})` : ''}
                  {' — '}{l.status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Estado vacío */}
      {!selectedProductoId ? (
        productosConLotes.length === 0 && !loadingProductos ? (
          <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
            <PackageSearch className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-gray-500">No hay productos con gestion de lotes</p>
            <p className="text-xs mt-1">Activa la opcion Maneja Lotes en el formulario de producto</p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-gray-500">Seleccione un producto y un lote para ver su trazabilidad</p>
          </div>
        )
      ) : !selectedLoteId ? (
        <div className="text-center py-12 text-gray-400">
          <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium text-gray-500">Seleccione un lote para ver sus despachos</p>
          {lotes.length === 0 && !loadingLotes && (
            <p className="text-xs mt-1 text-gray-400">Este producto no tiene lotes registrados</p>
          )}
        </div>
      ) : loteSeleccionado ? (
        <div>
          <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <span className="font-semibold">Lote {loteSeleccionado.nro_lote}</span>
            {' · '}
            <span>{productoSeleccionado?.nombre}</span>
            {loteSeleccionado.fecha_vencimiento && (
              <span className="ml-2 text-blue-600">
                Vence: {formatDate(loteSeleccionado.fecha_vencimiento)}
              </span>
            )}
          </div>

          <TrazabilidadDetalleTable
            lote={loteSeleccionado}
            productoNombre={productoSeleccionado?.nombre ?? ''}
            empresaId={empresaId}
          />
        </div>
      ) : null}
    </div>
  )
}
