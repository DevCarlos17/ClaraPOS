import { useState } from 'react'
import { Plus, ShoppingCart, Trash2, PauseCircle, List } from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { localNow } from '@/lib/dates'
import { crearVenta, type ProductoVenta } from '../hooks/use-ventas'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import { ClienteSelector } from './cliente-selector'
import { ProductoBuscador } from './producto-buscador'
import { LineaItems } from './linea-items'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { FacturasEsperaModal } from './facturas-espera-modal'
import { NuevoClienteRapidoModal } from './nuevo-cliente-rapido-modal'
import { useFacturasEsperaStore, type FacturaEnEspera } from '../stores/facturas-espera-store'

export function PosTerminal() {
  const { tasaValor, isLoading: tasaLoading } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { hasPermission } = usePermissions()
  const esperaStore = useFacturasEsperaStore()

  // Factura
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [lineas, setLineas] = useState<LineaVentaForm[]>([])

  // Pagos
  const [pagos, setPagos] = useState<PagoEntryForm[]>([])
  const [metodoId, setMetodoId] = useState('')
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')

  const [submitting, setSubmitting] = useState(false)

  // UI state
  const [showEsperaModal, setShowEsperaModal] = useState(false)
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false)
  const [showSupervisorPin, setShowSupervisorPin] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [confirmConfig, setConfirmConfig] = useState<{
    titulo: string
    mensaje: string
  } | null>(null)

  // Totales de la factura
  const totalUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario_usd, 0)
  const totalBs = usdToBs(totalUsd, tasaValor)
  const totalItems = lineas.reduce((sum, l) => sum + l.cantidad, 0)

  // Cálculos de pago
  const selectedMetodo = metodos.find((m) => m.id === metodoId)
  const monedaMetodo = selectedMetodo?.moneda as 'USD' | 'BS' | undefined

  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const montoUsd = p.moneda === 'BS' ? Number((p.monto / tasaValor).toFixed(2)) : p.monto
    return sum + montoUsd
  }, 0)
  const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
  const pendienteBs = usdToBs(pendienteUsd, tasaValor)
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  // --- Accion protegida ---
  // Si el usuario tiene permisos directos → ConfirmDialog
  // Si no → SupervisorPinDialog
  const handleProtectedAction = (
    action: () => void,
    titulo: string,
    mensaje: string
  ) => {
    setPendingAction(() => action)
    setConfirmConfig({ titulo, mensaje })
    if (hasPermission(PERMISSIONS.SALES_VOID)) {
      setShowConfirm(true)
    } else {
      setShowSupervisorPin(true)
    }
  }

  const executePendingAction = () => {
    pendingAction?.()
    setPendingAction(null)
    setConfirmConfig(null)
  }

  // --- Handlers ---

  const handleSelectCliente = (cliente: Cliente) => {
    setClienteId(cliente.id)
    setClienteNombre(cliente.nombre)
  }

  const handleClearCliente = () => {
    setClienteId(null)
    setClienteNombre('')
  }

  const handleNuevoClienteCreado = (cliente: { id: string; nombre: string; identificacion: string }) => {
    setClienteId(cliente.id)
    setClienteNombre(cliente.nombre)
  }

  const handleSelectProducto = (producto: ProductoVenta) => {
    const existing = lineas.findIndex((l) => l.producto_id === producto.id)
    if (existing >= 0) {
      setLineas((prev) =>
        prev.map((l, i) => (i === existing ? { ...l, cantidad: l.cantidad + 1 } : l))
      )
      return
    }
    setLineas((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        tipo: producto.tipo,
        cantidad: 1,
        precio_unitario_usd: parseFloat(producto.precio_venta_usd),
      },
    ])
  }

  const handleUpdateCantidad = (index: number, cantidad: number) => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, cantidad } : l)))
  }

  const handleRemoveLinea = (index: number) => {
    handleProtectedAction(
      () => setLineas((prev) => prev.filter((_, i) => i !== index)),
      'Eliminar artículo',
      '¿Seguro que deseas eliminar este artículo de la venta?'
    )
  }

  const handleAddPago = () => {
    const montoNum = parseFloat(monto)
    if (!metodoId || isNaN(montoNum) || montoNum <= 0 || !monedaMetodo) return
    setPagos((prev) => [
      ...prev,
      {
        metodo_cobro_id: metodoId,
        metodo_nombre: selectedMetodo!.nombre,
        moneda: monedaMetodo,
        monto: montoNum,
        referencia: referencia.trim() || undefined,
      },
    ])
    setMetodoId('')
    setMonto('')
    setReferencia('')
  }

  const handleRemovePago = (index: number) => {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  const resetForm = () => {
    setClienteId(null)
    setClienteNombre('')
    setLineas([])
    setPagos([])
    setMetodoId('')
    setMonto('')
    setReferencia('')
  }

  const handleCancelar = () => {
    if (lineas.length === 0 && pagos.length === 0) {
      resetForm()
      return
    }
    handleProtectedAction(
      resetForm,
      'Cancelar venta',
      '¿Seguro que deseas cancelar esta venta? Se perderán todos los artículos y pagos registrados.'
    )
  }

  const handleEnEspera = () => {
    if (lineas.length === 0) {
      toast.error('Agrega al menos un producto antes de poner en espera')
      return
    }
    if (!user) return

    const factura: FacturaEnEspera = {
      id: uuidv4(),
      clienteId,
      clienteNombre: clienteNombre || 'Sin cliente',
      lineas: [...lineas],
      pagos: [...pagos],
      tasa: tasaValor,
      totalUsd,
      totalBs,
      itemsCount: totalItems,
      usuarioId: user.id,
      usuarioNombre: user.nombre ?? user.email ?? '',
      fecha: localNow(),
    }

    esperaStore.agregar(factura)
    resetForm()
    toast.success('Factura guardada en espera')
  }

  const handleRecuperarEspera = (factura: FacturaEnEspera) => {
    if (lineas.length > 0 || pagos.length > 0) {
      toast.error('Hay una venta en curso. Cancela o pon en espera primero.')
      return
    }

    const recuperada = esperaStore.recuperar(factura.id)
    if (!recuperada) return

    setClienteId(recuperada.clienteId)
    setClienteNombre(recuperada.clienteNombre === 'Sin cliente' ? '' : recuperada.clienteNombre)
    setLineas(recuperada.lineas)
    setPagos(recuperada.pagos)
    toast.success('Factura recuperada')
  }

  const handleConfirmVenta = async () => {
    if (!clienteId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (lineas.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (lineas.some((l) => l.cantidad <= 0)) {
      toast.error('Hay artículos con cantidad inválida')
      return
    }
    if (pagos.length === 0) {
      toast.error('Agrega al menos un pago')
      return
    }
    if (!user) return

    setSubmitting(true)
    try {
      const result = await crearVenta({
        cliente_id: clienteId,
        tipo: tipoDetectado,
        tasa: tasaValor,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario_usd: l.precio_unitario_usd,
        })),
        pagos: pagos.map((p) => ({
          metodo_cobro_id: p.metodo_cobro_id,
          moneda: p.moneda,
          monto: p.monto,
          referencia: p.referencia,
        })),
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })

      toast.success(`Venta #${result.nroFactura} creada exitosamente`)
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la venta')
    } finally {
      setSubmitting(false)
    }
  }

  if (tasaLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Cargando...
      </div>
    )
  }

  if (tasaValor <= 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hay tasa de cambio configurada. Configura una tasa antes de realizar ventas.
        </p>
      </div>
    )
  }

  const esperaCount = esperaStore.facturas.length

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

        {/* ── COLUMNA IZQUIERDA: buscador + tabla de productos ── */}
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Agregar producto</label>
            <ProductoBuscador onSelect={handleSelectProducto} />
          </div>

          <LineaItems
            lineas={lineas}
            tasa={tasaValor}
            onUpdateCantidad={handleUpdateCantidad}
            onRemove={handleRemoveLinea}
          />
        </div>

        {/* ── COLUMNA DERECHA ── */}
        <div className="space-y-3 lg:sticky lg:top-6">

          {/* Fila 1: Cancelar + En Espera */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleCancelar}
              disabled={submitting}
              size="sm"
              className="w-full"
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={handleEnEspera}
              disabled={submitting || lineas.length === 0}
              size="sm"
              className="w-full"
            >
              <PauseCircle size={14} className="mr-1.5" />
              En Espera
            </Button>
          </div>

          {/* Fila 2: Ver Esperas + Confirmar */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={esperaCount > 0 ? 'secondary' : 'outline'}
              onClick={() => setShowEsperaModal(true)}
              size="sm"
              className="w-full"
            >
              <List size={14} className="mr-1.5" />
              {esperaCount > 0 ? `Esperas (${esperaCount})` : 'Esperas'}
            </Button>
            <Button
              onClick={handleConfirmVenta}
              disabled={submitting || !clienteId || lineas.length === 0 || pagos.length === 0}
              size="sm"
              className="w-full"
            >
              <ShoppingCart size={14} className="mr-1.5" />
              {submitting ? 'Procesando...' : 'Confirmar'}
            </Button>
          </div>

          {/* Bloque: cliente */}
          <div className="rounded-lg border p-3 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <ClienteSelector
                  clienteId={clienteId}
                  onSelect={handleSelectCliente}
                  onClear={handleClearCliente}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowNuevoClienteModal(true)}
                title="Nuevo cliente rápido"
                className="shrink-0 flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus size={13} />
                Nuevo
              </button>
            </div>
          </div>

          {/* Bloque: totales */}
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total USD</span>
              <span className="text-xl font-bold">{formatUsd(totalUsd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Bs</span>
              <span className="text-sm font-semibold text-muted-foreground">{formatBs(totalBs)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1.5">
              <span className="text-xs text-muted-foreground">Artículos</span>
              <span className="text-sm font-medium">{totalItems}</span>
            </div>
          </div>

          {/* Bloque: pagos */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-semibold">Pagos</p>

            {/* Resumen abonado / pendiente / tipo — siempre visible cuando hay pagos */}
            {pagos.length > 0 && (
              <div className="rounded-md bg-muted/50 px-3 py-2.5 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Abonado</span>
                  <span className="font-medium text-green-600">{formatUsd(totalAbonadoUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pendiente</span>
                  <span className={`font-medium ${pendienteUsd > 0.01 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatUsd(pendienteUsd)} / {formatBs(pendienteBs)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Estado</span>
                  <span className={`font-semibold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                    {tipoDetectado}
                  </span>
                </div>
              </div>
            )}

            {/* Formulario para agregar un pago — posición fija */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Método</label>
                  <select
                    value={metodoId}
                    onChange={(e) => setMetodoId(e.target.value)}
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Seleccionar...</option>
                    {metodos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.moneda})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Monto{monedaMetodo ? ` (${monedaMetodo})` : ''}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Referencia (opcional)"
                  className="flex-1 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPago}
                  disabled={!metodoId || !monto || parseFloat(monto) <= 0}
                >
                  <Plus size={14} className="mr-1" />
                  Agregar
                </Button>
              </div>
            </div>

            {/* Lista de pagos registrados — crece hacia abajo */}
            {pagos.length > 0 && (
              <div className="space-y-1.5">
                {pagos.map((p, i) => {
                  const equiv = p.moneda === 'BS' ? Number((p.monto / tasaValor).toFixed(2)) : p.monto
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{p.metodo_nombre}</span>
                        {p.referencia && (
                          <span className="ml-2 text-xs text-muted-foreground">Ref: {p.referencia}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span>
                          {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                          {p.moneda === 'BS' && (
                            <span className="ml-1 text-xs text-muted-foreground">({formatUsd(equiv)})</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePago(i)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── DIALOGS ── */}

      {/* Confirm dialog (para usuarios con permiso SALES_VOID) */}
      {confirmConfig && (
        <ConfirmDialog
          isOpen={showConfirm}
          onClose={() => {
            setShowConfirm(false)
            setPendingAction(null)
            setConfirmConfig(null)
          }}
          onConfirm={executePendingAction}
          titulo={confirmConfig.titulo}
          mensaje={confirmConfig.mensaje}
          confirmarTexto="Confirmar"
          destructive
        />
      )}

      {/* Supervisor PIN dialog (para usuarios sin permiso directo) */}
      <SupervisorPinDialog
        isOpen={showSupervisorPin}
        onClose={() => {
          setShowSupervisorPin(false)
          setPendingAction(null)
          setConfirmConfig(null)
        }}
        onAuthorized={() => executePendingAction()}
        titulo={confirmConfig?.titulo ?? 'Autorización de Supervisor'}
        mensaje={confirmConfig?.mensaje ?? 'Esta acción requiere autorización de un supervisor.'}
      />

      {/* Modal facturas en espera */}
      <FacturasEsperaModal
        isOpen={showEsperaModal}
        onClose={() => setShowEsperaModal(false)}
        onRecuperar={handleRecuperarEspera}
      />

      {/* Modal nuevo cliente rápido */}
      <NuevoClienteRapidoModal
        isOpen={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onCreado={handleNuevoClienteCreado}
      />
    </>
  )
}
