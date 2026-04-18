import { useState, useEffect, useRef } from 'react'
import { Plus, ShoppingCart, Trash2, Save, List, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { useBlocker } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { localNow } from '@/lib/dates'
import { crearVenta, type ProductoVenta } from '../hooks/use-ventas'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import { ClienteSelector } from './cliente-selector'
import { ProductoBuscador } from './producto-buscador'
import { LineaItems } from './linea-items'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { FacturasEsperaModal } from './facturas-espera-modal'
import { NuevoClienteRapidoModal } from './nuevo-cliente-rapido-modal'
import { AperturaSesionPosModal } from '@/features/caja/components/apertura-sesion-pos-modal'
import { useFacturasEsperaStore, type FacturaEnEspera } from '../stores/facturas-espera-store'

export function PosTerminal() {
  const { tasaValor, isLoading: tasaLoading } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { hasPermission } = usePermissions()
  const esperaStore = useFacturasEsperaStore()
  const { sesion, isLoading: sesionLoading } = useSesionActiva()

  // Factura
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteData, setClienteData] = useState<Cliente | null>(null)
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

  // Refs for navigation blocker (always captures latest state)
  const lineasRef = useRef(lineas)
  const pagosRef = useRef(pagos)
  const clienteIdRef = useRef(clienteId)
  const clienteNombreRef = useRef(clienteNombre)
  lineasRef.current = lineas
  pagosRef.current = pagos
  clienteIdRef.current = clienteId
  clienteNombreRef.current = clienteNombre

  // Totales de la factura
  const totalUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario_usd, 0)
  const totalBs = usdToBs(totalUsd, tasaValor)
  const totalItems = lineas.reduce((sum, l) => sum + l.cantidad, 0)

  // Calculos de pago
  const selectedMetodo = metodos.find((m) => m.id === metodoId)
  const monedaMetodo = selectedMetodo?.moneda as 'USD' | 'BS' | undefined

  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const montoUsd = p.moneda === 'BS' ? Number((p.monto / tasaValor).toFixed(2)) : p.monto
    return sum + montoUsd
  }, 0)
  const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
  const pendienteBs = usdToBs(pendienteUsd, tasaValor)
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  // --- Restaurar borrador al montar ---
  useEffect(() => {
    if (!user) return
    const borrador = esperaStore.borradorActual
    if (
      borrador &&
      borrador.usuarioId === user.id &&
      borrador.empresaId === user.empresa_id &&
      borrador.lineas.length > 0
    ) {
      setClienteId(borrador.clienteId)
      setClienteNombre(borrador.clienteNombre === 'Sin cliente' ? '' : borrador.clienteNombre)
      setLineas(borrador.lineas)
      setPagos(borrador.pagos)
      toast.info('Se restauro tu factura en proceso')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // --- Guardar borrador en cada cambio significativo ---
  useEffect(() => {
    if (!user?.empresa_id) return
    if (lineas.length === 0 && pagos.length === 0) return
    esperaStore.guardarBorrador({
      clienteId,
      clienteNombre: clienteNombre || 'Sin cliente',
      lineas: [...lineas],
      pagos: [...pagos],
      tasa: tasaValor,
      usuarioId: user.id,
      empresaId: user.empresa_id,
      ultimaActualizacion: localNow(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, pagos, clienteId, clienteNombre])

  // --- Bloqueador de navegacion: auto-guarda en Facturas Guardadas antes de navegar ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useBlocker(async (): Promise<any> => {
    const lineasActuales = lineasRef.current
    const pagosActuales = pagosRef.current
    if (lineasActuales.length > 0 && user) {
      const totalLineasUsd = lineasActuales.reduce((s, l) => s + l.cantidad * l.precio_unitario_usd, 0)
      const factura: FacturaEnEspera = {
        id: uuidv4(),
        clienteId: clienteIdRef.current,
        clienteNombre: clienteNombreRef.current || 'Sin cliente',
        lineas: [...lineasActuales],
        pagos: [...pagosActuales],
        tasa: tasaValor,
        totalUsd: totalLineasUsd,
        totalBs: usdToBs(totalLineasUsd, tasaValor),
        itemsCount: lineasActuales.reduce((s, l) => s + l.cantidad, 0),
        usuarioId: user.id,
        usuarioNombre: user.nombre ?? user.email ?? '',
        fecha: localNow(),
      }
      esperaStore.agregar(factura)
      esperaStore.limpiarBorrador()
      toast.info('Factura guardada en "Facturas Guardadas". Puedes recuperarla luego.')
    }
    return false // Permitir la navegacion
  }, lineas.length > 0 || pagos.length > 0)

  // --- Accion protegida ---
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
    setClienteData(cliente)
  }

  const handleClearCliente = () => {
    setClienteId(null)
    setClienteNombre('')
    setClienteData(null)
  }

  const handleNuevoClienteCreado = (cliente: { id: string; nombre: string; identificacion: string }) => {
    setClienteId(cliente.id)
    setClienteNombre(cliente.nombre)
    setClienteData(null) // Nuevo cliente: sin limite de credito por defecto
  }

  const handleSelectProducto = (producto: ProductoVenta) => {
    const existing = lineas.findIndex((l) => l.producto_id === producto.id)
    if (existing >= 0) {
      setLineas((prev) =>
        prev.map((l, i) =>
          i === existing
            ? { ...l, cantidad: l.es_decimal ? l.cantidad + 1 : l.cantidad + 1 }
            : l
        )
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
        stock_actual: parseFloat(producto.stock),
        es_decimal: producto.es_decimal === 1,
      },
    ])
  }

  const handleUpdateCantidad = (index: number, cantidad: number) => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, cantidad } : l)))
  }

  const handleRemoveLinea = (index: number) => {
    handleProtectedAction(
      () => setLineas((prev) => prev.filter((_, i) => i !== index)),
      'Eliminar articulo',
      '¿Seguro que deseas eliminar este articulo de la venta?'
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
    setClienteData(null)
    setLineas([])
    setPagos([])
    setMetodoId('')
    setMonto('')
    setReferencia('')
    esperaStore.limpiarBorrador()
  }

  const handleCancelar = () => {
    if (lineas.length === 0 && pagos.length === 0) {
      resetForm()
      return
    }
    handleProtectedAction(
      resetForm,
      'Cancelar venta',
      '¿Seguro que deseas cancelar esta venta? Se perderan todos los articulos y pagos registrados.'
    )
  }

  const handleGuardarFactura = () => {
    if (lineas.length === 0) {
      toast.error('Agrega al menos un producto antes de guardar')
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
    toast.success('Factura guardada')
  }

  const handleRecuperarEspera = (factura: FacturaEnEspera) => {
    if (lineas.length > 0 || pagos.length > 0) {
      toast.error('Hay una venta en curso. Cancela o guarda primero.')
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
      toast.error('Hay articulos con cantidad invalida')
      return
    }

    // Validacion de limite de credito
    if (tipoDetectado === 'CREDITO' && clienteData) {
      const limite = parseFloat(clienteData.limite_credito_usd)
      const saldoActual = parseFloat(clienteData.saldo_actual)
      if (limite <= 0) {
        toast.error('Este cliente no tiene credito asignado. Registra un pago para facturar a contado.')
        return
      }
      const creditoDisponible = Math.max(0, limite - saldoActual)
      if (pendienteUsd > creditoDisponible + 0.01) {
        toast.error(
          `El monto a credito (${formatUsd(pendienteUsd)}) excede el credito disponible (${formatUsd(creditoDisponible)})`
        )
        return
      }
    }

    // Validacion de stock negativo
    const canOverrideStock = hasPermission(PERMISSIONS.SALES_OVERRIDE_STOCK)
    const productosConStockInsuficiente = lineas.filter(
      (l) => l.tipo === 'P' && l.cantidad > l.stock_actual
    )
    if (productosConStockInsuficiente.length > 0 && !canOverrideStock) {
      const nombres = productosConStockInsuficiente.map((l) => l.nombre).join(', ')
      toast.error(`Stock insuficiente: ${nombres}. No tienes permiso para facturar en negativo.`)
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
        sesion_caja_id: sesion?.id ?? null,
      })

      toast.success(`Venta #${result.nroFactura} creada exitosamente`)
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la venta')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Validaciones para el boton confirmar ----
  const tieneLineasValidas = lineas.length > 0 && lineas.every((l) => l.cantidad > 0)
  const puedeConfirmar = !submitting && !!clienteId && tieneLineasValidas
  const textoConfirmar = submitting
    ? 'Procesando...'
    : tipoDetectado === 'CREDITO'
    ? 'Factura Credito'
    : 'Confirmar'

  if (tasaLoading || sesionLoading) {
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
      {/* Modal de apertura de sesion si no hay sesion activa */}
      {!sesion && (
        <AperturaSesionPosModal
          onAbierta={() => {/* useSesionActiva se actualiza reactivamente */}}
          tasa={tasaValor}
        />
      )}

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

          {/* Fila 1: Cancelar + Confirmar */}
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
              onClick={handleConfirmVenta}
              disabled={!puedeConfirmar}
              size="sm"
              className={`w-full ${tipoDetectado === 'CREDITO' && tieneLineasValidas && clienteId ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
            >
              {tipoDetectado === 'CREDITO' && tieneLineasValidas && clienteId ? (
                <CreditCard size={14} className="mr-1.5" />
              ) : (
                <ShoppingCart size={14} className="mr-1.5" />
              )}
              {textoConfirmar}
            </Button>
          </div>

          {/* Fila 2: Guardar Factura + Facturas Guardadas */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleGuardarFactura}
              disabled={submitting || lineas.length === 0}
              size="sm"
              className="w-full"
            >
              <Save size={14} className="mr-1.5" />
              Guardar Factura
            </Button>
            <Button
              variant={esperaCount > 0 ? 'secondary' : 'outline'}
              onClick={() => setShowEsperaModal(true)}
              size="sm"
              className="w-full"
            >
              <List size={14} className="mr-1.5" />
              {esperaCount > 0 ? `Facturas Guardadas (${esperaCount})` : 'Facturas Guardadas'}
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
                title="Nuevo cliente rapido"
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
              <span className="text-xs text-muted-foreground">Articulos</span>
              <span className="text-sm font-medium">{totalItems}</span>
            </div>
          </div>

          {/* Bloque: pagos */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-semibold">Pagos</p>

            {/* Resumen abonado / pendiente / tipo */}
            {(pagos.length > 0 || lineas.length > 0) && (
              <div className="rounded-md bg-muted/50 px-3 py-2.5 space-y-1.5 text-sm">
                {pagos.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Abonado</span>
                    <span className="font-medium text-green-600">{formatUsd(totalAbonadoUsd)}</span>
                  </div>
                )}
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

            {/* Formulario para agregar un pago */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Metodo</label>
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
                    onKeyDown={(e) => { if (e.key === '-') e.preventDefault() }}
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

            {/* Lista de pagos registrados */}
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

      <SupervisorPinDialog
        isOpen={showSupervisorPin}
        onClose={() => {
          setShowSupervisorPin(false)
          setPendingAction(null)
          setConfirmConfig(null)
        }}
        onAuthorized={() => executePendingAction()}
        titulo={confirmConfig?.titulo ?? 'Autorizacion de Supervisor'}
        mensaje={confirmConfig?.mensaje ?? 'Esta accion requiere autorizacion de un supervisor.'}
      />

      <FacturasEsperaModal
        isOpen={showEsperaModal}
        onClose={() => setShowEsperaModal(false)}
        onRecuperar={handleRecuperarEspera}
      />

      <NuevoClienteRapidoModal
        isOpen={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onCreado={handleNuevoClienteCreado}
      />
    </>
  )
}
