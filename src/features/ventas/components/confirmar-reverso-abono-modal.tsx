import { useState, useEffect } from 'react'
import { Warning } from '@phosphor-icons/react'
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
import { formatUsd, formatBs } from '@/lib/currency'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import {
  useClasificarAbonoParaReverso,
  REASON_BATCH_NO_DISPONIBLE,
  REASON_SAF_BLOQUEADO,
  REASON_LEGACY_SIN_TRAZABILIDAD,
} from '../hooks/use-clasificar-abono-reverso'
import { reversarAbonoDirectoDesdeTesoreria } from '@/features/tesoreria/hooks/use-reverso-abono-directo'
import {
  previewFacturasAfectadas,
  type PreviewFacturasAfectadas,
} from '@/features/tesoreria/hooks/use-preview-facturas-afectadas'
import { reversoSchema } from '@/features/tesoreria/schemas/tesoreria-schemas'
import { MENSAJES_POR_REASON_CODE } from '../utils/abono-reverso-mensajes'

// Mismos 3 mensajes que usa la lista de "Abonos individuales"
// (`factura-detalle-panel.tsx`, via `ConsultaFacturaModal`) — un solo
// texto fuente (`abono-reverso-mensajes.ts`), sin duplicar.
const DISABLED_MESSAGES: Record<string, string> = {
  [REASON_BATCH_NO_DISPONIBLE]: MENSAJES_POR_REASON_CODE.BATCH_NO_DISPONIBLE,
  [REASON_SAF_BLOQUEADO]: MENSAJES_POR_REASON_CODE.SAF_BLOQUEADO,
  [REASON_LEGACY_SIN_TRAZABILIDAD]: MENSAJES_POR_REASON_CODE.LEGACY_SIN_TRAZABILIDAD,
}

interface Props {
  pagoId: string | null
  isOpen: boolean
  onClose: () => void
  portalContainer?: HTMLElement | null
}

/**
 * `consulta-factura-reverso-abono-directo` (Unit 2, spec Requirement
 * "Preview y confirmacion de reverso directo" + "Tres estados deshabilitados
 * distintos" + "Warning pasivo si la sesion esta cerrada"). Mirror de
 * `ReversoModal` (Tesoreria) para el caso puntual "reversar UN abono desde
 * Consulta de Factura": clasifica el `pagoId` (Unit 1,
 * `useClasificarAbonoParaReverso`), muestra el fan-in (reusa
 * `previewFacturasAfectadas` tal cual) solo para DIRECT, y delega la
 * mutacion real en `reversarAbonoDirectoDesdeTesoreria` — NUNCA reimplementa
 * ninguna de las dos.
 *
 * Decision owner 3A (warn-and-allow): si `sesionCerrada` es `true` se
 * muestra un warning pasivo pero el boton de confirmar permanece habilitado
 * — el guard duro queda para Slice 2.
 */
export function ConfirmarReversoAbonoModal({ pagoId, isOpen, onClose, portalContainer }: Props) {
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const { clasificacion, loading: loadingClasificacion, error: errorClasificacion } =
    useClasificarAbonoParaReverso(isOpen ? pagoId : null)
  const [preview, setPreview] = useState<PreviewFacturasAfectadas | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [pendingMotivo, setPendingMotivo] = useState('')

  const empresaId = user?.empresa_id ?? ''
  const ingresoId = clasificacion?.estado === 'DIRECT' ? clasificacion.ingresoId : undefined
  const puedeConfirmar = clasificacion?.estado === 'DIRECT'
  const mensajeDeshabilitado = clasificacion?.reasonCode ? DISABLED_MESSAGES[clasificacion.reasonCode] : undefined

  useEffect(() => {
    if (isOpen) {
      setMotivo('')
      setMotivoError('')
      setShowPinDialog(false)
      setPendingMotivo('')
    }
  }, [isOpen])

  // Snapshot bajo demanda, mismo criterio que `ReversoModal` — el preview
  // solo se resuelve cuando la clasificacion ya confirmo DIRECT (nunca para
  // BATCH/SAF/LEGACY, que no tienen `ingresoId`).
  useEffect(() => {
    if (!isOpen || !ingresoId || !empresaId) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    previewFacturasAfectadas(empresaId, ingresoId)
      .then((resultado) => {
        if (!cancelled) setPreview(resultado)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, ingresoId, empresaId])

  async function ejecutarReverso(userId: string, reversedByNombre: string, motivoValidado: string) {
    if (!ingresoId || !empresaId) return
    setSaving(true)
    try {
      await reversarAbonoDirectoDesdeTesoreria({
        ingresoId,
        motivo: motivoValidado,
        userId,
        reversedByNombre,
        empresaId,
      })
      toast.success('Abono reversado correctamente')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar el abono')
    } finally {
      setSaving(false)
    }
  }

  function handlePinAuthorized(supervisorId: string) {
    setShowPinDialog(false)
    void ejecutarReverso(supervisorId, 'Supervisor', pendingMotivo)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMotivoError('')

    const parsed = reversoSchema.safeParse({ motivo })
    if (!parsed.success) {
      setMotivoError(parsed.error.issues[0]?.message ?? 'Motivo invalido')
      return
    }
    if (!user?.id || !empresaId || !ingresoId) return

    if (hasPermission(PERMISSIONS.CXC_REVERSE)) {
      await ejecutarReverso(user.id, user.nombre, parsed.data.motivo)
    } else {
      setPendingMotivo(parsed.data.motivo)
      setShowPinDialog(true)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" container={portalContainer ?? undefined}>
        <DialogHeader>
          <DialogTitle>Reversar abono</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loadingClasificacion && (
            <p className="text-sm text-muted-foreground">Clasificando abono...</p>
          )}

          {!loadingClasificacion && errorClasificacion && (
            <p className="text-sm text-destructive">{errorClasificacion}</p>
          )}

          {!loadingClasificacion && mensajeDeshabilitado && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
              <p>{mensajeDeshabilitado}</p>
            </div>
          )}

          {!loadingClasificacion && puedeConfirmar && (
            <div
              data-testid="preview-facturas-afectadas"
              className="rounded-lg border p-4 space-y-2 text-sm"
            >
              <p className="font-medium">Facturas afectadas por este reverso</p>

              {previewLoading && <p className="text-muted-foreground">Cargando facturas afectadas...</p>}

              {!previewLoading && preview && preview.facturasDirectas.length <= 1 && (
                <p className="text-muted-foreground">Este reverso afecta solo esta factura.</p>
              )}

              {!previewLoading && preview && preview.facturasDirectas.length > 1 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground">
                    Este abono es parte de un pago global; se reversaran {preview.facturasDirectas.length}{' '}
                    facturas:
                  </p>
                  <ul className="space-y-1">
                    {preview.facturasDirectas.map((f) => (
                      <li key={f.ventaId} className="flex justify-between gap-2">
                        <span>{f.nroFactura}</span>
                        <span className="shrink-0">
                          {f.monedaCodigo === 'VES' ? formatBs(f.montoAplicadoNativo) : formatUsd(f.montoAplicadoUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!loadingClasificacion && puedeConfirmar && clasificacion?.sesionCerrada && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
              <p>Esta sesión ya está cerrada; el reverso puede desincronizar el cuadre.</p>
            </div>
          )}

          {!loadingClasificacion && puedeConfirmar && (
            <form id="confirmar-reverso-abono-form" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="motivo-reverso-abono">Motivo del reverso *</Label>
                <Input
                  id="motivo-reverso-abono"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Describa el motivo del reverso"
                />
                {motivoError && <p className="text-xs text-destructive">{motivoError}</p>}
              </div>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="confirmar-reverso-abono-form"
            variant="destructive"
            disabled={saving || !puedeConfirmar || loadingClasificacion}
          >
            {saving ? 'Reversando...' : 'Confirmar reverso'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <SupervisorPinDialog
        isOpen={showPinDialog}
        onClose={() => {
          setShowPinDialog(false)
          setPendingMotivo('')
        }}
        onAuthorized={handlePinAuthorized}
        titulo="Autorizacion requerida"
        mensaje="Ingresa el PIN de supervisor para reversar este abono."
        requiredPermission={PERMISSIONS.CXC_REVERSE}
      />
    </Dialog>
  )
}
