import { useEffect, useRef } from 'react'
import { Printer } from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'
import { useValorPorDepto } from '../hooks/use-inventario-reportes'

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
]

interface InventarioValorModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InventarioValorModal({ isOpen, onClose }: InventarioValorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { deptos, isLoading } = useValorPorDepto()

  const maxValue = deptos.reduce((max, d) => Math.max(max, d.valorUsd), 0)
  const totalUsd = deptos.reduce((sum, d) => sum + d.valorUsd, 0)

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

    const filas = deptos
      .map((d) => {
        const sharePct = totalUsd > 0 ? ((d.valorUsd / totalUsd) * 100).toFixed(1) : '0'
        return `<tr>
          <td>${d.departamento}</td>
          <td style="text-align:right">${formatUsd(d.valorUsd)}</td>
          <td style="text-align:right">${sharePct}%</td>
        </tr>`
      })
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Valoracion por Departamento</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tfoot td { background: #f9fafb; font-weight: 600; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Valoracion de Inventario por Departamento</h1>
  <table>
    <thead>
      <tr>
        <th>Departamento</th>
        <th style="text-align:right">Valor (USD)</th>
        <th style="text-align:right">Participacion</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr>
        <td>Total</td>
        <td style="text-align:right">${formatUsd(totalUsd)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:16px;font-size:10px;color:#9ca3af">Generado: ${new Date().toLocaleString('es-VE')}</p>
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Valoracion por Departamento</h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : deptos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Sin productos en inventario</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deptos.map((d, i) => {
              const pct = maxValue > 0 ? (d.valorUsd / maxValue) * 100 : 0
              const sharePct = totalUsd > 0 ? ((d.valorUsd / totalUsd) * 100).toFixed(1) : '0'
              return (
                <div key={d.departamento}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium truncate mr-2">{d.departamento}</span>
                    <span className="text-gray-500 whitespace-nowrap">
                      {formatUsd(d.valorUsd)} ({sharePct}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${COLORS[i % COLORS.length]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatUsd(totalUsd)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-5">
          <button
            onClick={handlePDF}
            disabled={deptos.length === 0}
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
