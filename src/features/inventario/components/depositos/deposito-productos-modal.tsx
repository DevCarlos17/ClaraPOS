import { useRef, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'

interface ProductoDeposito {
  id: string
  codigo: string
  nombre: string
  tipo: string
  stock_deposito: number
}

interface DepositoProductosModalProps {
  deposito: Deposito | null
  onClose: () => void
}

export function DepositoProductosModal({ deposito, onClose }: DepositoProductosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  useEffect(() => {
    if (deposito) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [deposito])

  const { data, isLoading } = useQuery(
    deposito
      ? `SELECT p.id, p.codigo, p.nombre, p.tipo,
           SUM(CASE WHEN mi.tipo = 'E' THEN CAST(mi.cantidad AS REAL)
                    ELSE -CAST(mi.cantidad AS REAL) END) as stock_deposito
         FROM movimientos_inventario mi
         LEFT JOIN productos p ON p.id = mi.producto_id
         WHERE mi.empresa_id = ? AND mi.deposito_id = ?
         GROUP BY mi.producto_id
         HAVING stock_deposito > 0
         ORDER BY p.nombre ASC`
      : '',
    deposito ? [empresaId, deposito.id] : []
  )

  const productos = (data ?? []) as ProductoDeposito[]

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function handleReporteDeposito() {
    if (!deposito) return
    const w = window.open('', '_blank')
    if (!w) return

    const filas = productos
      .map(
        (p) =>
          `<tr>
            <td style="font-family:monospace">${p.codigo}</td>
            <td>${p.nombre}</td>
            <td style="text-align:center">${p.tipo === 'P' ? 'Producto' : p.tipo === 'S' ? 'Servicio' : 'Combo'}</td>
            <td style="text-align:right">${p.stock_deposito.toFixed(3)}</td>
          </tr>`
      )
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Deposito ${deposito.nombre}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    h2 { font-size: 13px; margin-bottom: 4px; color: #374151; }
    p { margin: 2px 0 12px; color: #6b7280; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Deposito: ${deposito.nombre}</h1>
  ${deposito.direccion ? `<h2>${deposito.direccion}</h2>` : ''}
  <p>
    Total articulos con stock: ${productos.length}
    &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}
  </p>
  <table>
    <thead>
      <tr>
        <th>Codigo</th>
        <th>Producto / Servicio</th>
        <th style="text-align:center">Tipo</th>
        <th style="text-align:right">Stock</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  if (!deposito) return null

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl max-h-[85vh]"
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{deposito.nombre}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Articulos con stock registrado en este deposito
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReporteDeposito}
              disabled={productos.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Reporte
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : productos.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-sm font-medium">Sin articulos registrados en este deposito</p>
              <p className="text-xs mt-1">Los movimientos de inventario con este deposito apareceran aqui</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2.5 font-medium text-gray-700">Codigo</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-700">Nombre</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-700">Tipo</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-700">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.codigo}</td>
                      <td className="px-3 py-2 text-gray-900">{p.nombre}</td>
                      <td className="px-3 py-2">
                        {p.tipo === 'P' ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Producto
                          </span>
                        ) : p.tipo === 'S' ? (
                          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                            Servicio
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            Combo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {p.stock_deposito.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-700">
                      Total articulos: {productos.length}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                      {productos.reduce((s, p) => s + p.stock_deposito, 0).toFixed(3)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
