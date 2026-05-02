import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Printer } from '@phosphor-icons/react'
import { useAjusteDetalle, useAjuste, aplicarAjuste, anularAjuste } from '@/features/inventario/hooks/use-ajustes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatDate } from '@/lib/format'
import { formatUsd } from '@/lib/currency'

interface AjusteDetalleModalProps {
  isOpen: boolean
  onClose: () => void
  ajusteId: string
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'BORRADOR':
      return <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">BORRADOR</span>
    case 'APLICADO':
      return <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">APLICADO</span>
    case 'ANULADO':
      return <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">ANULADO</span>
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">{status}</span>
  }
}

export function AjusteDetalleModal({ isOpen, onClose, ajusteId }: AjusteDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { lineas, isLoading: loadingLineas } = useAjusteDetalle(ajusteId)
  const { ajuste, isLoading: loadingAjuste } = useAjuste(ajusteId)
  const { user } = useCurrentUser()

  const [applying, setApplying] = useState(false)
  const [showConfirmAplicar, setShowConfirmAplicar] = useState(false)
  const [showConfirmAnular, setShowConfirmAnular] = useState(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  useEffect(() => {
    if (isOpen) {
      setShowConfirmAplicar(false)
      setShowConfirmAnular(false)
      setMotivoAnulacion('')
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  async function handleAplicar() {
    if (!user?.id || !user?.empresa_id) return
    setApplying(true)
    try {
      await aplicarAjuste(ajusteId, user.empresa_id, user.id)
      toast.success('Ajuste aplicado correctamente. El inventario ha sido actualizado.')
      setShowConfirmAplicar(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al aplicar ajuste')
    } finally {
      setApplying(false)
    }
  }

  async function handleAnular() {
    if (!user?.id || !user?.empresa_id) return
    if (!motivoAnulacion.trim()) {
      toast.error('Ingresa el motivo de anulacion')
      return
    }
    setApplying(true)
    try {
      await anularAjuste(ajusteId, user.empresa_id, user.id, motivoAnulacion.trim())
      toast.success('Ajuste anulado. El inventario ha sido revertido.')
      setShowConfirmAnular(false)
      setMotivoAnulacion('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al anular ajuste')
    } finally {
      setApplying(false)
    }
  }

  function handleGenerarPDF() {
    if (!ajuste) return
    const w = window.open('', '_blank')
    if (!w) return

    const totalUsd = lineas.reduce((sum, l) => {
      return sum + (parseFloat(l.cantidad) * (l.costo_unitario != null ? parseFloat(l.costo_unitario) : 0))
    }, 0)

    const filas = lineas
      .map((l) => {
        const cant = parseFloat(l.cantidad)
        const costo = l.costo_unitario != null ? parseFloat(l.costo_unitario) : 0
        const subtotal = cant * costo
        return `<tr>
          <td><span style="font-family:monospace;color:#6b7280">${l.codigo_producto ?? ''}</span> ${l.nombre_producto ?? '-'}</td>
          <td>${l.nombre_deposito ?? '-'}</td>
          <td style="text-align:right">${cant.toFixed(3)}</td>
          <td style="text-align:right">${l.costo_unitario != null ? formatUsd(costo) : '-'}</td>
          <td style="text-align:right">${l.costo_unitario != null ? formatUsd(subtotal) : '-'}</td>
        </tr>`
      })
      .join('')

    const operLabel = ajuste.operacion_base ?? '-'
    const statusLabel = ajuste.status

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ajuste ${ajuste.num_ajuste}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 16px; font-size: 11px; }
    .info span { color: #6b7280; }
    .info strong { color: #111827; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tfoot td { background: #f9fafb; font-weight: 600; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Ajuste de Inventario #${ajuste.num_ajuste}</h1>
  <div class="info">
    <div><span>Fecha:</span> <strong>${ajuste.fecha ? formatDate(ajuste.fecha) : '-'}</strong></div>
    <div><span>Motivo:</span> <strong>${ajuste.nombre_motivo ?? '-'}</strong></div>
    <div><span>Operacion:</span> <strong>${operLabel}</strong></div>
    <div><span>Status:</span> <strong>${statusLabel}</strong></div>
    ${ajuste.observaciones ? `<div style="grid-column:1/-1"><span>Observaciones:</span> <strong>${ajuste.observaciones}</strong></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>Deposito</th>
        <th style="text-align:right">Cantidad</th>
        <th style="text-align:right">Costo Unit.</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right">Total:</td>
        <td style="text-align:right">${formatUsd(totalUsd)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:16px;font-size:10px;color:#9ca3af">Generado: ${new Date().toLocaleString('es-VE')}</p>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  const isLoading = loadingLineas || loadingAjuste

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Ajuste #{ajuste?.num_ajuste ?? '...'}
            </h2>
            {ajuste && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                <span>Fecha: {ajuste.fecha ? formatDate(ajuste.fecha) : '-'}</span>
                <span>Motivo: {ajuste.nombre_motivo ?? '-'}</span>
                <span>Operacion: {ajuste.operacion_base ?? '-'}</span>
                {ajuste.observaciones && <span>Obs: {ajuste.observaciones}</span>}
              </div>
            )}
          </div>
          {ajuste && <StatusBadge status={ajuste.status} />}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 bg-gray-100 rounded animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        ) : lineas.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Sin lineas de detalle</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Deposito</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Costo Unit.</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => (
                  <tr key={linea.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">
                      <span className="font-mono text-gray-500 text-xs">{linea.codigo_producto}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      {linea.nombre_producto ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{linea.nombre_deposito ?? '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {parseFloat(linea.cantidad).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {linea.costo_unitario != null
                        ? `$${parseFloat(linea.costo_unitario).toFixed(2)}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Confirmacion Aplicar */}
        {showConfirmAplicar && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm font-medium text-amber-800 mb-3">
              Al aplicar este ajuste se modificara el inventario de todos los productos listados. Esta accion no se puede deshacer directamente (solo anulando). ¿Confirmar?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleAplicar}
                disabled={applying}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {applying ? 'Aplicando...' : 'Si, Aplicar'}
              </button>
              <button
                onClick={() => setShowConfirmAplicar(false)}
                disabled={applying}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Confirmacion Anular */}
        {showConfirmAnular && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800 mb-2">
              Anular este ajuste revertira todos los movimientos de inventario generados. Ingresa el motivo:
            </p>
            <input
              type="text"
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              placeholder="Motivo de anulacion (requerido)"
              className="w-full rounded-md border border-red-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAnular}
                disabled={applying || !motivoAnulacion.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {applying ? 'Anulando...' : 'Confirmar Anulacion'}
              </button>
              <button
                onClick={() => { setShowConfirmAnular(false); setMotivoAnulacion('') }}
                disabled={applying}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Botones de accion */}
        <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
          <div className="flex gap-2">
            {/* Aplicar: solo si BORRADOR */}
            {ajuste?.status === 'BORRADOR' && !showConfirmAnular && (
              <button
                onClick={() => setShowConfirmAplicar((v) => !v)}
                disabled={applying || lineas.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Aplicar Ajuste
              </button>
            )}
            {/* Anular: solo si APLICADO */}
            {ajuste?.status === 'APLICADO' && !showConfirmAplicar && (
              <button
                onClick={() => setShowConfirmAnular((v) => !v)}
                disabled={applying}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Anular
              </button>
            )}
            {/* PDF */}
            <button
              onClick={handleGenerarPDF}
              disabled={lineas.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Generar PDF
            </button>
          </div>
          <button
            type="button"
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
