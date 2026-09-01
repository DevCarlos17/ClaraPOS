import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { actualizarCaja } from '@/features/configuracion/hooks/use-cajas'
import {
  useDepositosVentaActivos,
  actualizarDeposito,
  type Deposito,
} from '@/features/inventario/hooks/use-depositos'
import { NativeSelect } from '@/components/ui/native-select'
import type { CajaReferenciaDeposito } from '@/features/inventario/lib/deposito-inactivo'

interface ReasignarCajaDialogProps {
  isOpen: boolean
  deposito: Deposito | null
  /**
   * Cajas afectadas (`cajas.deposito_id` apuntando al deposito a desactivar).
   * `DepositoList` solo abre este dialogo cuando `resolveBloqueoDesactivacion`
   * devuelve `motivo: 'CAJA_SIN_SESION'` — es decir, NINGUNA de estas cajas
   * tiene una sesion abierta (esas se bloquean con un toast antes, sin llegar
   * a abrir el dialogo).
   */
  cajas: CajaReferenciaDeposito[]
  onClose: () => void
}

/**
 * Dialogo de reasignacion proactiva (Decision de producto #1, change
 * `guarda-deposito-inactivo`): antes de desactivar un deposito que una o mas
 * cajas tienen seleccionado, se le pide al usuario reasignar cada caja a
 * otro deposito destino (activo, `permite_venta=1`, distinto al que se
 * desactiva). Al confirmar: reasigna TODAS las cajas primero
 * (`actualizarCaja` x N) y RECIEN DESPUES desactiva el deposito
 * (`actualizarDeposito`), para que nunca quede una ventana donde una caja
 * activa apunte a un deposito ya inactivo.
 */
export function ReasignarCajaDialog({ isOpen, deposito, cajas, onClose }: ReasignarCajaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { depositos: depositosDestino } = useDepositosVentaActivos()
  const [seleccion, setSeleccion] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const opcionesDestino = depositosDestino.filter((d) => d.id !== deposito?.id)

  useEffect(() => {
    if (isOpen) {
      setSeleccion({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, deposito])

  function handleSeleccionChange(cajaId: string, depositoDestinoId: string) {
    setSeleccion((prev) => ({ ...prev, [cajaId]: depositoDestinoId }))
  }

  const todasLasCajasTienenDestino = cajas.every((c) => !!seleccion[c.cajaId])

  async function handleConfirmar() {
    if (!deposito || !todasLasCajasTienenDestino) return

    setSubmitting(true)
    try {
      for (const caja of cajas) {
        await actualizarCaja(caja.cajaId, { deposito_id: seleccion[caja.cajaId]! })
      }
      await actualizarDeposito(deposito.id, { is_active: false })
      toast.success('Cajas reasignadas y deposito desactivado correctamente')
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-1">Reasignar cajas antes de desactivar</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Las siguientes cajas tienen seleccionado el deposito{' '}
          <span className="font-medium">{deposito?.nombre}</span>. Elige un deposito destino para cada
          una antes de desactivarlo.
        </p>

        <div className="space-y-4">
          {cajas.map((caja) => (
            <div key={caja.cajaId}>
              <label
                htmlFor={`reasignar-caja-${caja.cajaId}`}
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                {caja.cajaNombre}
              </label>
              <NativeSelect
                id={`reasignar-caja-${caja.cajaId}`}
                value={seleccion[caja.cajaId] ?? ''}
                onChange={(e) => handleSeleccionChange(caja.cajaId, e.target.value)}
              >
                <option value="" disabled>
                  -- Selecciona un deposito destino --
                </option>
                {opcionesDestino.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={submitting || !todasLasCajasTienenDestino}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
