import { useState } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { abrirSesionCaja } from '@/features/caja/hooks/use-sesiones-caja'

interface AperturaSesionPosModalProps {
  onAbierta: () => void
  tasa: number
}

export function AperturaSesionPosModal({ onAbierta, tasa }: AperturaSesionPosModalProps) {
  const { user } = useCurrentUser()
  const { cajas, isLoading: loadingCajas } = useCajasActivas()

  const [cajaId, setCajaId] = useState('')
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [monto, setMonto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const montoNum = parseFloat(monto) || 0
  const montoUsd = moneda === 'BS' && tasa > 0 ? montoNum / tasa : montoNum

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const newErrors: Record<string, string> = {}
    if (!cajaId) newErrors.caja_id = 'Selecciona una caja'
    if (montoNum < 0) newErrors.monto = 'El monto no puede ser negativo'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!user?.empresa_id) {
      toast.error('No se pudo identificar la empresa')
      return
    }

    setSubmitting(true)
    try {
      await abrirSesionCaja({
        caja_id: cajaId,
        monto_apertura_usd: montoUsd,
        usuario_id: user.id,
        empresa_id: user.empresa_id,
      })
      toast.success('Sesion de caja abierta')
      onAbierta()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al abrir sesion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 border">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Apertura de Caja</h3>
            <p className="text-xs text-muted-foreground">
              No hay sesion abierta. Registra el efectivo inicial para continuar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Caja */}
          <div>
            <label className="block text-sm font-medium mb-1">Caja</label>
            <select
              value={cajaId}
              onChange={(e) => setCajaId(e.target.value)}
              disabled={loadingCajas}
              className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.caja_id ? 'border-destructive' : 'border-input'
              }`}
            >
              <option value="">{loadingCajas ? 'Cargando...' : 'Seleccionar caja'}</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {errors.caja_id && (
              <p className="text-xs text-destructive mt-1">{errors.caja_id}</p>
            )}
          </div>

          {/* Monto con toggle de moneda */}
          <div>
            <label className="block text-sm font-medium mb-1">Efectivo inicial</label>
            <div className="flex gap-2">
              <div className="flex rounded-md border border-input overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMoneda('USD')}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    moneda === 'USD' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setMoneda('BS')}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    moneda === 'BS' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  Bs
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onKeyDown={(e) => { if (e.key === '-') e.preventDefault() }}
                placeholder="0.00"
                className={`flex-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.monto ? 'border-destructive' : 'border-input'
                }`}
              />
            </div>
            {moneda === 'BS' && tasa > 0 && montoNum > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Equivale a ${montoUsd.toFixed(2)} USD (tasa: {tasa.toFixed(4)})
              </p>
            )}
            {errors.monto && (
              <p className="text-xs text-destructive mt-1">{errors.monto}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || loadingCajas}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Abriendo sesion...' : 'Abrir Sesion y Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}
