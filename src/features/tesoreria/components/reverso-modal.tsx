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
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { reversarMovBancario, reversarMovCajaFuerte } from '../hooks/use-conciliacion-tesoreria'
import { reversarTraspaso } from '../hooks/use-traspasos'
import { reversarAbonoDirectoDesdeTesoreria } from '../hooks/use-reverso-abono-directo'
import {
  previewFacturasAfectadas,
  type PreviewFacturasAfectadas,
  type FacturaAfectadaPreview,
} from '../hooks/use-preview-facturas-afectadas'
import { esTransferenciaCliente } from '../utils/es-transferencia-cliente'
import { reversoSchema } from '../schemas/tesoreria-schemas'
import type { MovimientoTesoreria } from './movimientos-table'

const SAF_BLOCK_MESSAGE =
  'Este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía'

interface Props {
  isOpen: boolean
  onClose: () => void
  movimiento: MovimientoTesoreria | null
  monedaSimbolo: string
  traspasoId?: string
}

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  DEPOSITO_CIERRE: 'Cierre caja',
  CIERRE_CONSOLIDACION: 'Consolidacion de cierre',
  TRANSFERENCIA_CLIENTE: 'Cobro cliente',
  PAGO_PROVEEDOR: 'Pago proveedor',
  GASTO: 'Gasto',
  TRASPASO: 'Traspaso',
  REVERSO: 'Reverso',
  MANUAL: 'Manual',
}

/**
 * Monto de una factura afectada en su MONEDA NATIVA (spec Requirement
 * MODIFIED "Renderizado de facturas afectadas en el panel"): VES muestra
 * el monto aplicado en Bs, cualquier otra moneda muestra el monto
 * aplicado en USD. Reemplaza el bimonetario forzado anterior
 * (`formatMontoPago` + `aLineaPago`) — el metodo de pago ya no se repite
 * por linea, se movio al header del modal (ver `metodoAbono` mas abajo).
 */
function montoFacturaNativo(f: FacturaAfectadaPreview): string {
  return f.monedaCodigo === 'VES' ? formatBs(f.montoAplicadoNativo) : formatUsd(f.montoAplicadoUsd)
}

/**
 * Suma de montos nativos de un conjunto de facturas afectadas (pago
 * directo + SAF) en la MISMA moneda nativa que las lineas individuales —
 * un abono = un metodo/moneda, la primera entrada decide la moneda. Nunca
 * fuerza USD como el `preview.totalUsd` del hook (spec Requirement
 * MODIFIED, "Total afectado en moneda nativa").
 */
function totalAfectadoNativo(entradas: FacturaAfectadaPreview[]): string {
  if (entradas.length === 0) return formatUsd(0)
  const esNativoVes = entradas[0].monedaCodigo === 'VES'
  const total = entradas.reduce(
    (acc, f) => acc + (esNativoVes ? f.montoAplicadoNativo : f.montoAplicadoUsd),
    0
  )
  return esNativoVes ? formatBs(total) : formatUsd(total)
}

export function ReversoModal({ isOpen, onClose, movimiento, monedaSimbolo, traspasoId }: Props) {
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const [saving, setSaving] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [preview, setPreview] = useState<PreviewFacturasAfectadas | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [pendingMotivo, setPendingMotivo] = useState('')

  useEffect(() => {
    if (isOpen) {
      setMotivo('')
      setMotivoError('')
      setShowPinDialog(false)
      setPendingMotivo('')
    }
  }, [isOpen])

  const aplicaPreview = esTransferenciaCliente(movimiento?.origen)
  const empresaId = user?.empresa_id ?? ''
  const movimientoId = movimiento?.id ?? ''
  // Slice 2b-ii: el reverso REAL de un ingreso TRANSFERENCIA_CLIENTE pasa
  // por el orquestador `reversarAbonoDirectoDesdeTesoreria` en vez del
  // reverso bancario estandar — gated por ausencia de SAF (ver
  // tesoreria-preview-facturas-afectadas/spec.md Requirement "Accion de
  // reverso expuesta y gateada por presencia de SAF").
  const esReversoDirecto = !traspasoId && aplicaPreview
  const bloqueadoPorSaf = Boolean(
    aplicaPreview && preview?.estado === 'OK' && preview.facturasSaf.length > 0
  )

  // Snapshot bajo demanda al abrir el modal — NO una suscripcion reactiva
  // (el preview es un snapshot del estado de las facturas en ese instante,
  // ver spec Requirement "Solo lectura y aislamiento multi-tenant"). Deps
  // primitivos (regla `rerender-dependencies`), no el objeto `movimiento`.
  useEffect(() => {
    if (!isOpen || !aplicaPreview || !movimientoId || !empresaId) {
      setPreview(null)
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    previewFacturasAfectadas(empresaId, movimientoId)
      .then((resultado) => {
        if (!cancelled) setPreview(resultado)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, aplicaPreview, movimientoId, empresaId])

  // Ejecuta el reverso REAL contra el orquestador — invocado directo
  // (usuario con CXC_REVERSE) o tras autorizacion por PIN de supervisor
  // (handlePinAuthorized abajo). El orquestador asume la identidad ya
  // resuelta (userId/reversedByNombre); la autorizacion ocurre ANTES de
  // llegar aqui.
  async function ejecutarReversoDirecto(
    userId: string,
    reversedByNombre: string,
    motivoValidado: string
  ) {
    if (!movimiento || !user?.empresa_id) return
    setSaving(true)
    try {
      await reversarAbonoDirectoDesdeTesoreria({
        ingresoId: movimiento.id,
        motivo: motivoValidado,
        userId,
        reversedByNombre,
        empresaId: user.empresa_id,
      })
      toast.success('Movimiento reversado correctamente')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar')
    } finally {
      setSaving(false)
    }
  }

  function handlePinAuthorized(supervisorId: string) {
    setShowPinDialog(false)
    void ejecutarReversoDirecto(supervisorId, 'Supervisor', pendingMotivo)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMotivoError('')

    const parsed = reversoSchema.safeParse({ motivo })
    if (!parsed.success) {
      setMotivoError(parsed.error.issues[0]?.message ?? 'Motivo invalido')
      return
    }

    if (!user?.id || !user?.empresa_id || !movimiento) return

    if (esReversoDirecto) {
      // Defensa en profundidad: el boton ya esta deshabilitado cuando hay
      // SAF (ver render abajo), pero este guard bloquea tambien un submit
      // disparado directo sobre el form (p.ej. Enter en el input).
      if (bloqueadoPorSaf) {
        toast.error(SAF_BLOCK_MESSAGE)
        return
      }
      if (hasPermission(PERMISSIONS.CXC_REVERSE)) {
        await ejecutarReversoDirecto(user.id, user.nombre, parsed.data.motivo)
      } else {
        setPendingMotivo(parsed.data.motivo)
        setShowPinDialog(true)
      }
      return
    }

    setSaving(true)
    try {
      if (traspasoId) {
        // Full traspaso reversal — both sides
        await reversarTraspaso({
          traspasoId,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        toast.success('Traspaso reversado correctamente')
      } else if (movimiento._source === 'BANCO') {
        const result = await reversarMovBancario({
          movId: movimiento.id,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        if (result.needsManualCxc) {
          toast.warning(
            'Movimiento reversado. Revise Cuentas por Cobrar para ajustar el saldo del cliente.'
          )
        } else {
          toast.success('Movimiento reversado correctamente')
        }
      } else {
        await reversarMovCajaFuerte({
          movId: movimiento.id,
          motivo: parsed.data.motivo,
          userId: user.id,
          empresaId: user.empresa_id,
        })
        toast.success('Movimiento reversado correctamente')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar')
    } finally {
      setSaving(false)
    }
  }

  if (!movimiento) return null

  const monto = parseFloat(movimiento.monto)
  // Metodo del abono — atributo del ABONO completo (un pago_id = un
  // metodo), no de cada factura. Se muestra UNA VEZ en el header (spec
  // Requirement ADDED "Metodo de pago unico en el header del panel de
  // reverso"); se omite si no hay facturas resueltas (estado LEGACY o sin
  // facturasDirectas/facturasSaf).
  const metodoAbono =
    preview?.estado === 'OK'
      ? (preview.facturasDirectas[0] ?? preview.facturasSaf[0])?.metodoNombre
      : undefined

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {traspasoId ? 'Reversar traspaso' : 'Reversar movimiento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Detalles del movimiento */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span>{formatDate(movimiento.fecha)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Origen</span>
              <span>{ORIGEN_LABELS[movimiento.origen] ?? movimiento.origen}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className={movimiento.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-700'}>
                {movimiento.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Monto</span>
              <span>
                {monedaSimbolo === '$' ? formatUsd(monto) : formatBs(monto)}
              </span>
            </div>
            {metodoAbono && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Método abono</span>
                <span>{metodoAbono}</span>
              </div>
            )}
          </div>

          {/* Warning si forma parte de un traspaso */}
          {traspasoId && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
              <p>
                Este movimiento forma parte de un traspaso. Al reversarlo, se revertirán{' '}
                <strong>ambos extremos</strong> de la operación automáticamente.
              </p>
            </div>
          )}

          {/* Panel read-only: facturas afectadas por este reverso (solo
              aplica a ingresos TRANSFERENCIA_CLIENTE — slice 1b-panel de
              preview-facturas-afectadas-reverso-tesoreria) */}
          {aplicaPreview && (
            <div
              data-testid="preview-facturas-afectadas"
              className="rounded-lg border p-4 space-y-3 text-sm"
            >
              <p className="font-medium">Facturas afectadas por este reverso</p>

              {previewLoading && (
                <p className="text-muted-foreground">Cargando facturas afectadas...</p>
              )}

              {!previewLoading && preview?.estado === 'LEGACY' && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
                  <p>
                    Sin trazabilidad: este ingreso es anterior al registro de abonos y no se puede
                    determinar automaticamente que facturas afecta. Verifique manualmente el saldo
                    del cliente en Cuentas por Cobrar antes de reversar.
                  </p>
                </div>
              )}

              {!previewLoading &&
                preview?.estado === 'OK' &&
                preview.facturasDirectas.length === 0 &&
                preview.facturasSaf.length === 0 && (
                  <p className="text-muted-foreground">
                    No se encontraron facturas asociadas a este cobro.
                  </p>
                )}

              {!previewLoading &&
                preview?.estado === 'OK' &&
                (preview.facturasDirectas.length > 0 || preview.facturasSaf.length > 0) && (
                  <div className="space-y-3">
                    <div
                      data-testid="preview-facturas-lista-scroll"
                      className="max-h-48 overflow-y-auto space-y-3"
                    >
                      {preview.facturasDirectas.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Pago directo
                          </p>
                          <ul className="mt-1 space-y-1">
                            {preview.facturasDirectas.map((f) => (
                              <li key={f.ventaId} className="flex justify-between gap-2">
                                <span>{f.nroFactura}</span>
                                <span className="shrink-0">{montoFacturaNativo(f)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {preview.facturasSaf.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Afectada por saldo a favor (SAF)
                          </p>
                          <ul className="mt-1 space-y-1">
                            {preview.facturasSaf.map((f) => (
                              <li key={f.ventaId} className="flex justify-between gap-2">
                                <span>{f.nroFactura}</span>
                                <span className="shrink-0">{montoFacturaNativo(f)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total afectado</span>
                      <span>
                        {totalAfectadoNativo([...preview.facturasDirectas, ...preview.facturasSaf])}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este total equivale al monto del reverso.
                    </p>
                  </div>
                )}

              {/* Bloqueo SAF — la accion de reverso solo esta habilitada
                  cuando `facturasSaf` esta vacio (spec delta
                  tesoreria-preview-facturas-afectadas, Requirement "Accion
                  de reverso expuesta y gateada por presencia de SAF") */}
              {bloqueadoPorSaf && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                  <Warning size={16} className="shrink-0 mt-0.5" weight="fill" />
                  <p>{SAF_BLOCK_MESSAGE}</p>
                </div>
              )}
            </div>
          )}

          <form id="reverso-form" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="motivo">Motivo del reverso *</Label>
              <Input
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describa el motivo del reverso"
              />
              {motivoError && <p className="text-xs text-destructive">{motivoError}</p>}
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="reverso-form"
            variant="destructive"
            disabled={saving || bloqueadoPorSaf}
          >
            {saving ? 'Reversando...' : 'Confirmar reverso'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* PIN de supervisor — solo se abre cuando el usuario actual no
          tiene CXC_REVERSE y el reverso es de un ingreso
          TRANSFERENCIA_CLIENTE (mismo patron que `factura-detalle-cxc.tsx`). */}
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
