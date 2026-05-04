import { useState, useEffect } from 'react'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { createCajaFuerte, updateCajaFuerte } from '../hooks/use-caja-fuerte'
import type { CajaFuerte } from '../hooks/use-caja-fuerte'
import { cajaFuerteSchema } from '../schemas/tesoreria-schemas'

interface Props {
  isOpen: boolean
  onClose: () => void
  editando?: CajaFuerte | null
}

interface Moneda {
  id: string
  codigo_iso: string
  nombre: string
}

export function CajaFuerteModal({ isOpen, onClose, editando }: Props) {
  const { user } = useCurrentUser()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [nombre, setNombre] = useState('')
  const [monedaId, setMonedaId] = useState('')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const { data: monedasData } = useQuery(
    'SELECT id, codigo_iso, nombre FROM monedas WHERE is_active = 1 ORDER BY codigo_iso ASC',
    []
  )
  const monedas = (monedasData ?? []) as Moneda[]

  useEffect(() => {
    if (isOpen) {
      setErrors({})
      if (editando) {
        setNombre(editando.nombre)
        setMonedaId(editando.moneda_id)
        setDescripcion(editando.descripcion ?? '')
        setSaldoInicial('')
      } else {
        setNombre('')
        setMonedaId('')
        setSaldoInicial('')
        setDescripcion('')
      }
    }
  }, [isOpen, editando])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = cajaFuerteSchema.safeParse({
      nombre,
      moneda_id: monedaId,
      saldo_inicial: saldoInicial ? parseFloat(saldoInicial) : undefined,
      descripcion: descripcion || undefined,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as string
        fieldErrors[key] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    if (!user?.id || !user?.empresa_id) return
    setSaving(true)
    try {
      if (editando) {
        await updateCajaFuerte(editando.id, {
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion || null,
          usuario_id: user.id,
        })
        toast.success('Caja fuerte actualizada')
      } else {
        await createCajaFuerte({
          nombre: parsed.data.nombre,
          moneda_id: parsed.data.moneda_id,
          saldo_inicial: parsed.data.saldo_inicial,
          descripcion: parsed.data.descripcion,
          empresa_id: user.empresa_id,
          usuario_id: user.id,
        })
        toast.success('Caja fuerte creada')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar caja fuerte' : 'Nueva caja fuerte'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: BOVEDA EFECTIVO USD"
            />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre}</p>}
          </div>

          {!editando && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="moneda_id">Moneda *</Label>
                <select
                  id="moneda_id"
                  value={monedaId}
                  onChange={(e) => setMonedaId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Seleccione moneda</option>
                  {monedas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.codigo_iso} — {m.nombre}
                    </option>
                  ))}
                </select>
                {errors.moneda_id && (
                  <p className="text-xs text-destructive">{errors.moneda_id}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="saldo_inicial">Saldo inicial</Label>
                <Input
                  id="saldo_inicial"
                  type="number"
                  step="0.01"
                  min="0"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  placeholder="0.00"
                />
                {errors.saldo_inicial && (
                  <p className="text-xs text-destructive">{errors.saldo_inicial}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripcion</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripcion opcional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear caja fuerte'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
