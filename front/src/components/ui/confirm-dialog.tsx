import { useState } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  titulo: string
  mensaje: string
  confirmarTexto?: string
  cancelarTexto?: string
  destructive?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  titulo,
  mensaje,
  confirmarTexto = 'Confirmar',
  cancelarTexto = 'Cancelar',
  destructive = false,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 border">
        <h3 className="text-lg font-semibold mb-2">{titulo}</h3>
        <p className="text-sm text-muted-foreground mb-6">{mensaje}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {cancelarTexto}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isLoading ? 'Procesando...' : confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  )
}
