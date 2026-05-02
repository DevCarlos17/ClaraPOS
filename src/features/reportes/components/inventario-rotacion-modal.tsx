import { useEffect, useRef } from 'react'
import { Printer } from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTopProductosRango } from '@/features/dashboard/hooks/use-dashboard'

interface InventarioRotacionModalProps {
  isOpen: boolean
  onClose: () => void
  tipo: 'mayor' | 'menor'
}

export function InventarioRotacionModal({ isOpen, onClose, tipo }: InventarioRotacionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos, isLoading } = useTopProductosRango(30, 25, tipo === 'mayor' ? 'DESC' : 'ASC')

  const titulo = tipo === 'mayor' ? 'Mayor Rotacion' : 'Menor Rotacion'
  const subtitulo =
    tipo === 'mayor'
      ? 'Top 25 productos mas vendidos (ultimos 30 dias)'
      : 'Top 25 productos menos vendidos (ultimos 30 dias)'

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function handlePDF() {
    const w = window.open('', '_blank')
    if (!w) return

    const filas = productos
      .map(
        (p, i) => `<tr>
          <td>${i + 1}</td>
          <td style="font-family:monospace">${p.codigo}</td>
          <td>${p.nombre}</td>
          <td style="text-align:right">${formatNumber(p.cantidad, 0)}</td>
          <td style="text-align:right">${formatUsd(p.totalUsd)}</td>
        </tr>`
      )
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
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
  <h1>${titulo}</h1>
  <p>${subtitulo} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Codigo</th>
        <th>Producto</th>
        <th style="text-align:right">Cantidad</th>
        <th style="text-align:right">Total USD</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : productos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">Sin ventas en los ultimos 30 dias</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-3 font-medium text-gray-700 w-10">#</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Codigo</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Producto</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-700">Cant.</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-700">Total USD</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr key={p.codigo} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{p.codigo}</td>
                    <td className="px-3 py-2.5 text-gray-900">{p.nombre}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(p.cantidad, 0)}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatUsd(p.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between mt-5">
          <button
            onClick={handlePDF}
            disabled={productos.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Generar PDF
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
