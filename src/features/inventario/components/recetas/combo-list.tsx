import { useState, useMemo } from 'react'
import { Printer, FileText } from '@phosphor-icons/react'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useTodasLasRecetas } from '@/features/inventario/hooks/use-recetas'
import { ComboDetalleModal } from './combo-detalle-modal'
import { formatUsd } from '@/lib/currency'

export function ComboList() {
  const { productos: combos, isLoading } = useProductosTipo('C')
  const { productos: productosP } = useProductosTipo('P')
  const { recetas } = useTodasLasRecetas()

  const [comboSeleccionado, setComboSeleccionado] = useState<Producto | null>(null)

  const productoMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string; costo_usd: string; stock: string }>()
    for (const p of productosP) {
      map.set(p.id, { nombre: p.nombre, codigo: p.codigo, costo_usd: p.costo_usd, stock: p.stock })
    }
    return map
  }, [productosP])

  const recetasPorCombo = useMemo(() => {
    const map = new Map<string, typeof recetas>()
    for (const r of recetas) {
      const list = map.get(r.servicio_id) ?? []
      list.push(r)
      map.set(r.servicio_id, list)
    }
    return map
  }, [recetas])

  function calcularCostoCombo(comboId: string): number {
    const rs = recetasPorCombo.get(comboId) ?? []
    return rs.reduce((sum, r) => {
      const prod = productoMap.get(r.producto_id)
      return sum + (prod ? parseFloat(prod.costo_usd) * parseFloat(r.cantidad) : 0)
    }, 0)
  }

  function calcularDisponibilidad(comboId: string): number {
    const rs = recetasPorCombo.get(comboId) ?? []
    if (rs.length === 0) return 0
    let min = Infinity
    for (const r of rs) {
      const prod = productoMap.get(r.producto_id)
      if (!prod) return 0
      const stock = parseFloat(prod.stock)
      const cantidad = parseFloat(r.cantidad)
      if (cantidad <= 0) continue
      const disp = Math.floor(stock / cantidad)
      if (disp < min) min = disp
    }
    return min === Infinity ? 0 : min
  }

  function handleReporteLista() {
    const w = window.open('', '_blank')
    if (!w) return

    const filas = combos
      .map((combo) => {
        const costo = calcularCostoCombo(combo.id)
        const pvp = parseFloat(combo.precio_venta_usd)
        const margen = pvp > 0 ? ((pvp - costo) / pvp * 100).toFixed(1) : '0.0'
        const nComp = (recetasPorCombo.get(combo.id) ?? []).length
        return `<tr>
          <td>${combo.codigo}</td>
          <td>${combo.nombre}</td>
          <td style="text-align:center">${nComp}</td>
          <td style="text-align:right">${formatUsd(costo)}</td>
          <td style="text-align:right">${formatUsd(pvp)}</td>
          <td style="text-align:right">${margen}%</td>
          <td style="text-align:center">${combo.is_active === 1 ? 'Activo' : 'Inactivo'}</td>
        </tr>`
      })
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Combos</title>
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
  <h1>Reporte de Combos / Recetas</h1>
  <p>Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Codigo</th>
        <th>Nombre</th>
        <th style="text-align:center">Componentes</th>
        <th style="text-align:right">Costo (USD)</th>
        <th style="text-align:right">PVP (USD)</th>
        <th style="text-align:right">Margen</th>
        <th style="text-align:center">Estado</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  function handleReporteDetallado() {
    const w = window.open('', '_blank')
    if (!w) return

    const bloques = combos
      .map((combo) => {
        const rs = recetasPorCombo.get(combo.id) ?? []
        const costo = calcularCostoCombo(combo.id)
        const pvp = parseFloat(combo.precio_venta_usd)
        const margen = pvp > 0 ? ((pvp - costo) / pvp * 100).toFixed(1) : '0.0'
        const filas = rs
          .map((r) => {
            const prod = productoMap.get(r.producto_id)
            const cantNum = parseFloat(r.cantidad)
            const costoUnit = prod ? parseFloat(prod.costo_usd) : 0
            const subtotal = costoUnit * cantNum
            return `<tr>
              <td>${prod ? prod.codigo : '-'}</td>
              <td>${prod ? prod.nombre : 'No encontrado'}</td>
              <td style="text-align:right">${cantNum.toFixed(3)}</td>
              <td style="text-align:right">${formatUsd(costoUnit)}</td>
              <td style="text-align:right">${formatUsd(subtotal)}</td>
            </tr>`
          })
          .join('')

        return `<div class="combo-block">
          <div class="combo-header">
            <span class="combo-codigo">${combo.codigo}</span> ${combo.nombre}
            <span class="combo-meta">Costo: ${formatUsd(costo)} &nbsp;|&nbsp; PVP: ${formatUsd(pvp)} &nbsp;|&nbsp; Margen: ${margen}%</span>
          </div>
          ${rs.length === 0
            ? '<p class="sin-comp">Sin componentes registrados</p>'
            : `<table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Producto</th>
                    <th style="text-align:right">Cantidad</th>
                    <th style="text-align:right">Costo Unit.</th>
                    <th style="text-align:right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="text-align:right;font-weight:600">Costo Total:</td>
                    <td style="text-align:right;font-weight:600">${formatUsd(costo)}</td>
                  </tr>
                </tfoot>
              </table>`
          }
        </div>`
      })
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Detallado Combos</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p.fecha { margin: 2px 0 16px; color: #666; font-size: 11px; }
    .combo-block { margin-bottom: 20px; page-break-inside: avoid; }
    .combo-header { background: #e0e7ff; border-left: 4px solid #4f46e5; padding: 6px 10px; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .combo-codigo { font-family: monospace; color: #4f46e5; }
    .combo-meta { float: right; font-size: 11px; font-weight: normal; color: #374151; }
    .sin-comp { color: #9ca3af; font-style: italic; padding: 4px 10px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 4px 8px; }
    tfoot td { background: #f9fafb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Reporte Detallado de Combos / Recetas</h1>
  <p class="fecha">Generado: ${new Date().toLocaleString('es-VE')}</p>
  ${bloques}
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6">
      {/* Barra de acciones */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          {combos.length} {combos.length === 1 ? 'combo' : 'combos'} registrados
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleReporteLista}
            disabled={combos.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Reporte Lista
          </button>
          <button
            onClick={handleReporteDetallado}
            disabled={combos.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            Reporte Detallado
          </button>
        </div>
      </div>

      {combos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <p className="text-base font-medium">No hay combos registrados</p>
          <p className="text-sm mt-1">
            Crea un producto de tipo <strong>Combo / Receta</strong> en el catalogo de productos
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Codigo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Componentes</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo (USD)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">PVP (USD)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margen</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Dispon.</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((combo) => {
                const costo = calcularCostoCombo(combo.id)
                const pvp = parseFloat(combo.precio_venta_usd)
                const margen = pvp > 0 ? ((pvp - costo) / pvp * 100) : 0
                const nComp = (recetasPorCombo.get(combo.id) ?? []).length
                const disponibilidad = calcularDisponibilidad(combo.id)

                return (
                  <tr
                    key={combo.id}
                    onClick={() => setComboSeleccionado(combo)}
                    className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-muted-foreground">{combo.codigo}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{combo.nombre}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{nComp}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatUsd(costo)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatUsd(pvp)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={margen >= 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                        {margen.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {nComp === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <span className={`text-sm font-medium ${disponibilidad > 0 ? 'text-foreground' : 'text-red-600'}`}>
                          ~{disponibilidad}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        combo.is_active === 1
                          ? 'bg-green-50 text-green-700 ring-green-600/20'
                          : 'bg-muted text-muted-foreground ring-muted-foreground/20'
                      }`}>
                        {combo.is_active === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ComboDetalleModal
        combo={comboSeleccionado}
        onClose={() => setComboSeleccionado(null)}
      />
    </div>
  )
}
