import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from '@phosphor-icons/react'

// Denominaciones vigentes
const DENOMINACIONES_USD = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.10, 0.05, 0.01]
const DENOMINACIONES_BS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25]

interface BilletesModalProps {
  isOpen: boolean
  onClose: () => void
  moneda: 'USD' | 'BS'
  titulo: string
  onUseTotal: (total: number) => void
}

export function CuadreBilletesModal({ isOpen, onClose, moneda, titulo, onUseTotal }: BilletesModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const denominaciones = moneda === 'USD' ? DENOMINACIONES_USD : DENOMINACIONES_BS
  const [conteos, setConteos] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setConteos({})
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const setConteo = useCallback((denom: number, value: string) => {
    setConteos((prev) => ({ ...prev, [String(denom)]: value }))
  }, [])

  const total = denominaciones.reduce((sum, d) => {
    const count = parseInt(conteos[String(d)] ?? '0', 10) || 0
    return sum + count * d
  }, 0)

  function handleUse() {
    onUseTotal(Number(total.toFixed(2)))
    onClose()
  }

  const symbol = moneda === 'USD' ? '$' : 'Bs.'
  const currencyFmt = (n: number) => {
    if (Number.isInteger(n)) return `${symbol} ${n.toLocaleString('es-VE')}`
    return `${symbol} ${n.toFixed(2)}`
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-5 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Conteo de Billetes</h2>
            <p className="text-xs text-muted-foreground">{titulo} &middot; {moneda}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabla de denominaciones */}
        <div className="overflow-y-auto max-h-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-muted-foreground">Denominacion</th>
                <th className="pb-2 font-medium text-muted-foreground text-center">Cantidad</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {denominaciones.map((d) => {
                const count = parseInt(conteos[String(d)] ?? '0', 10) || 0
                const subtotal = count * d
                return (
                  <tr key={d} className="border-b border-muted/50">
                    <td className="py-1.5 font-mono text-sm">{currencyFmt(d)}</td>
                    <td className="py-1.5 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={conteos[String(d)] ?? ''}
                        onChange={(e) => setConteo(d, e.target.value)}
                        className="w-16 text-center rounded border border-input bg-white px-2 py-1 text-sm tabular-nums"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1.5 text-right text-sm font-mono">
                      {subtotal > 0 ? currencyFmt(subtotal) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Total contado</span>
            <span className="text-xl font-bold tabular-nums">
              {symbol} {total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <button
            onClick={handleUse}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Usar este total
          </button>
        </div>
      </div>
    </dialog>
  )
}
