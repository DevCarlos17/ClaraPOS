import { useState, useRef, useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { hashPin } from '@/lib/crypto'
import { usePowerSync } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface SupervisorPinDialogProps {
  isOpen: boolean
  onClose: () => void
  onAuthorized: (supervisorId: string) => void
  titulo?: string
  mensaje?: string
  requiredPermission?: string
}

export function SupervisorPinDialog({
  isOpen,
  onClose,
  onAuthorized,
  titulo = 'Autorización de Supervisor',
  mensaje = 'Ingresa el PIN de supervisor para autorizar esta acción.',
  requiredPermission = 'ventas.anular',
}: SupervisorPinDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const db = usePowerSync()
  const { user } = useCurrentUser()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setPin('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  const handleVerificar = async () => {
    if (!pin) {
      setError('Ingrese el PIN')
      return
    }
    if (!user?.empresa_id) {
      setError('No se pudo determinar la empresa')
      return
    }

    setLoading(true)
    setError('')

    try {
      const hash = await hashPin(pin, user.empresa_id)

      const result = await db.getAll<{ id: string; rol_id: string }>(
        `SELECT id, rol_id FROM usuarios WHERE empresa_id = ? AND pin_supervisor_hash = ? AND is_active = 1`,
        [user.empresa_id, hash]
      )

      if (!result || result.length === 0) {
        setError('PIN incorrecto')
        setPin('')
        inputRef.current?.focus()
        return
      }

      const supervisor = result[0]

      const rolResult = await db.getAll<{ is_system: number }>(
        `SELECT is_system FROM roles WHERE id = ?`,
        [supervisor.rol_id]
      )

      const isSystem = rolResult?.[0]?.is_system === 1

      if (!isSystem) {
        const permResult = await db.getAll<{ id: string }>(
          `SELECT rp.id FROM rol_permisos rp
           JOIN permisos p ON rp.permiso_id = p.id
           WHERE rp.rol_id = ? AND p.slug = ?`,
          [supervisor.rol_id, requiredPermission]
        )

        if (!permResult || permResult.length === 0) {
          setError('Este usuario no tiene autorización para esta acción')
          setPin('')
          inputRef.current?.focus()
          return
        }
      }

      onAuthorized(supervisor.id)
      onClose()
    } catch {
      setError('Error al verificar el PIN')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerificar()
    if (e.key === 'Escape') onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 backdrop:backdrop-blur-sm rounded-xl shadow-2xl p-0 w-full max-w-sm mx-4 border bg-card"
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{titulo}</h3>
            <p className="text-xs text-muted-foreground">{mensaje}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              PIN de supervisor
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '')
                setPin(val)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="••••••"
              className={`w-full text-center text-xl tracking-widest rounded-md border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary bg-background ${
                error ? 'border-destructive' : 'border-input'
              }`}
            />
            {error && (
              <p className="text-xs text-destructive mt-1.5">{error}</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleVerificar}
              disabled={loading || !pin}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Autorizar'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
