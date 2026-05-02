import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@powersync/react'
import { Plus, Trash, FloppyDisk, ListBullets, ArrowCircleDown, ArrowCircleUp, Wallet, Handshake, XCircle, User, Buildings, CreditCard, ShoppingCart } from '@phosphor-icons/react'
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
import { crearVenta, type ProductoVenta, type CargoEspecial } from '../hooks/use-ventas'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import { ClienteSelector, type ClienteSelectorHandle } from './cliente-selector'
import { ProductoBuscador, type ProductoBuscadorHandle } from './producto-buscador'
import { LineaItems } from './linea-items'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { FacturasEsperaModal } from './facturas-espera-modal'
import { NuevoClienteRapidoModal } from './nuevo-cliente-rapido-modal'
import { VentaExitosaModal, type VentaExitosaData } from './venta-exitosa-modal'
import { AperturaSesionPosModal } from '@/features/caja/components/apertura-sesion-pos-modal'
import { SesionCajaForm } from '@/features/caja/components/sesion-caja-form'
import { IngresoRetiroModal } from '@/features/caja/components/ingreso-retiro-modal'
import { AvanceModal, type AvanceAplicado } from '@/features/caja/components/avance-modal'
import { PrestamoModal, type PrestamoAplicado } from '@/features/caja/components/prestamo-modal'
import { useFacturasEsperaStore, type FacturaEnEspera } from '../stores/facturas-espera-store'

export function PosTerminal() {
  const { tasaValor, isLoading: tasaLoading } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { hasPermission, isOwner } = usePermissions()
  const canMovManualPos = isOwner || hasPermission(PERMISSIONS.CAJA_MOV_MANUAL)
  const canCloseCajaPos = isOwner || hasPermission(PERMISSIONS.CAJA_CLOSE)
  const esperaStore = useFacturasEsperaStore()
  const { sesion, isLoading: sesionLoading } = useSesionActiva()

  // Datos de contexto para la barra de caja
  const { data: empresaData } = useQuery(
    user?.empresa_id ? 'SELECT nombre FROM empresas WHERE id = ? LIMIT 1' : '',
    user?.empresa_id ? [user.empresa_id] : []
  )
  const empresaNombre = empresaData?.[0]
    ? (empresaData[0] as { nombre: string }).nombre
    : null

  const { data: cajaData } = useQuery(
    sesion?.caja_id ? 'SELECT nombre FROM cajas WHERE id = ? LIMIT 1' : '',
    sesion?.caja_id ? [sesion.caja_id] : []
  )
  const cajaNombre = cajaData?.[0]
    ? (cajaData[0] as { nombre: string }).nombre
    : null

  // Factura
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteData, setClienteData] = useState<Cliente | null>(null)
  const [lineas, setLineas] = useState<LineaVentaForm[]>([])
  const [cargosEspeciales, setCargosEspeciales] = useState<CargoEspecial[]>([])

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

  // Caja state - modales dedicados
  const [showIngresoModal, setShowIngresoModal] = useState(false)
  const [showRetiroModal, setShowRetiroModal] = useState(false)
  const [showAvanceModal, setShowAvanceModal] = useState(false)
  const [showPrestamoModal, setShowPrestamoModal] = useState(false)
  const [showCierrePosPin, setShowCierrePosPin] = useState(false)
  const [showCierrePos, setShowCierrePos] = useState(false)
  const [ventaExitosa, setVentaExitosa] = useState<VentaExitosaData | null>(null)

  // Refs for navigation blocker (always captures latest state)
  const lineasRef = useRef(lineas)
  const pagosRef = useRef(pagos)
  const clienteIdRef = useRef(clienteId)
  const clienteNombreRef = useRef(clienteNombre)
  lineasRef.current = lineas
  pagosRef.current = pagos
  clienteIdRef.current = clienteId
  clienteNombreRef.current = clienteNombre

  // Refs para atajos de teclado
  const productoBuscadorRef = useRef<ProductoBuscadorHandle>(null)
  const clienteSelectorRef = useRef<ClienteSelectorHandle>(null)
  const keyboardHandlerRef = useRef<((e: KeyboardEvent) => void) | undefined>(undefined)

  // Totales de la factura
  const totalProductosUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario_usd, 0)
  const totalCargosEspUsd = cargosEspeciales.reduce((sum, c) => sum + c.montoCargoUsd, 0)
  const totalUsd = totalProductosUsd + totalCargosEspUsd
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
            ? { ...l, cantidad: l.cantidad + 1 }
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
    setCargosEspeciales([])
    setMetodoId('')
    setMonto('')
    setReferencia('')
    esperaStore.limpiarBorrador()
  }

  const handleCancelar = () => {
    if (lineas.length === 0 && pagos.length === 0 && cargosEspeciales.length === 0) {
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
    if (lineas.length === 0 && cargosEspeciales.length === 0) {
      toast.error('Agrega al menos un producto o cargo especial antes de guardar')
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
    if (lineas.length === 0 && cargosEspeciales.length === 0) {
      toast.error('Agrega al menos un producto o aplica un avance/prestamo')
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
        cargosEspeciales,
      })

      setVentaExitosa({
        nroFactura: result.nroFactura,
        clienteNombre: clienteNombre || 'Sin cliente',
        totalUsd,
        totalBs,
        tipo: tipoDetectado,
        pagos: [...pagos],
        tasa: tasaValor,
        cargosEspeciales: [...cargosEspeciales],
      })
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la venta')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Caja desde POS ---
  const handleCerrarCajaPos = () => {
    if (canCloseCajaPos) {
      setShowCierrePos(true)
    } else {
      setShowCierrePosPin(true)
    }
  }

  // ---- Validaciones para el boton confirmar ----
  const tieneLineasValidas = lineas.length > 0 && lineas.every((l) => l.cantidad > 0)
  const tieneContenido = tieneLineasValidas || cargosEspeciales.length > 0
  const puedeConfirmar = !submitting && !!clienteId && tieneContenido
  const textoConfirmar = submitting
    ? 'Procesando...'
    : tipoDetectado === 'CREDITO'
    ? 'Factura Credito'
    : 'Confirmar'

  // ---- Handlers de cargos especiales ----
  const handleAvanceAplicado = (avance: AvanceAplicado) => {
    setCargosEspeciales((prev) => [
      ...prev,
      {
        tipo: 'AVANCE',
        descripcion: avance.descripcion,
        montoCargoUsd: avance.totalCargoUsd,
        movimientoIds: avance.movimientoIds,
      },
    ])
  }

  const handlePrestamoAplicado = (prestamo: PrestamoAplicado) => {
    setCargosEspeciales((prev) => [
      ...prev,
      {
        tipo: 'PRESTAMO',
        descripcion: prestamo.descripcion,
        montoCargoUsd: prestamo.totalDeudaUsd,
        movimientoIds: prestamo.movimientoIds,
        diasPlazo: prestamo.diasPlazo,
        clienteId: clienteId ?? undefined,
      },
    ])
  }

  const handleRemoveCargo = (index: number) => {
    setCargosEspeciales((prev) => prev.filter((_, i) => i !== index))
  }

  // --- Atajos de teclado ---
  keyboardHandlerRef.current = (e: KeyboardEvent) => {
    const anyModalOpen =
      showConfirm || showSupervisorPin || showEsperaModal || showNuevoClienteModal ||
      showIngresoModal || showRetiroModal || showAvanceModal || showPrestamoModal ||
      showCierrePosPin || showCierrePos || !!ventaExitosa
    if (anyModalOpen) return

    const isInInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement

    switch (e.key) {
      case 'F1':
        e.preventDefault()
        productoBuscadorRef.current?.focus()
        break
      case 'F2':
        e.preventDefault()
        clienteSelectorRef.current?.focus()
        break
      case 'F5':
        e.preventDefault()
        if (sesion && canMovManualPos) setShowIngresoModal(true)
        break
      case 'F6':
        e.preventDefault()
        if (sesion && canMovManualPos) setShowRetiroModal(true)
        break
      case 'F7':
        e.preventDefault()
        if (sesion && canMovManualPos) setShowAvanceModal(true)
        break
      case 'F8':
        e.preventDefault()
        handleGuardarFactura()
        break
      case 'F9':
        e.preventDefault()
        setShowEsperaModal(true)
        break
      case 'F10':
        e.preventDefault()
        handleConfirmVenta()
        break
      case 'Escape':
        if (!isInInput) {
          e.preventDefault()
          handleCancelar()
        }
        break
      default:
        if (e.altKey && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          handleAddPago()
        }
        break
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyboardHandlerRef.current?.(e)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              Agregar producto
              <kbd className="rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none text-muted-foreground">F1</kbd>
            </label>
            <ProductoBuscador ref={productoBuscadorRef} onSelect={handleSelectProducto} />
          </div>

          <LineaItems
            lineas={lineas}
            tasa={tasaValor}
            onUpdateCantidad={handleUpdateCantidad}
            onRemove={handleRemoveLinea}
          />

          {/* Cargos especiales (avance / prestamo) */}
          {cargosEspeciales.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                Cargos especiales
              </p>
              {cargosEspeciales.map((cargo, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded mr-2 ${
                      cargo.tipo === 'PRESTAMO'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {cargo.tipo}
                    </span>
                    <span className="text-amber-800 truncate">{cargo.descripcion}</span>
                    {cargo.tipo === 'PRESTAMO' && cargo.diasPlazo && (
                      <span className="ml-1 text-xs text-amber-600">({cargo.diasPlazo} dias)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-amber-900">{formatUsd(cargo.montoCargoUsd)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCargo(i)}
                      className="rounded p-1 text-amber-600 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Quitar cargo (no revierte el efectivo entregado)"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs font-medium text-amber-800 border-t border-amber-200 pt-1.5">
                <span>Total cargos</span>
                <span>{formatUsd(totalCargosEspUsd)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA ── */}
        <div className="rounded-2xl bg-card shadow-lg lg:sticky lg:top-6 flex flex-col lg:h-[calc(100vh-6.5rem)] overflow-hidden">

          {/* ── Zona scrolleable ── */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

            {/* Operaciones de Caja */}
            {sesion && (canMovManualPos || canCloseCajaPos) && (
              <div className="space-y-2">
                {/* Contexto: usuario, caja, empresa */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  {user?.nombre && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User size={11} />
                      <span className="font-medium text-foreground">{user.nombre}</span>
                    </div>
                  )}
                  {cajaNombre && (
                    <span className="text-xs text-muted-foreground">· {cajaNombre}</span>
                  )}
                  {empresaNombre && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Buildings size={11} />
                      <span>{empresaNombre}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {canMovManualPos && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowIngresoModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-green-700 hover:bg-green-50 hover:border-green-200 transition-colors"
                      >
                        <ArrowCircleDown size={12} />
                        Ingreso
                        <kbd className="ml-0.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F5</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRetiroModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-red-700 hover:bg-red-50 hover:border-red-200 transition-colors"
                      >
                        <ArrowCircleUp size={12} />
                        Retiro
                        <kbd className="ml-0.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F6</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAvanceModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 transition-colors"
                      >
                        <Wallet size={12} />
                        Avance
                        <kbd className="ml-0.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F7</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrestamoModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-colors"
                      >
                        <Handshake size={12} />
                        Prestamo
                      </button>
                    </>
                  )}
                  {canCloseCajaPos && (
                    <button
                      type="button"
                      onClick={handleCerrarCajaPos}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <XCircle size={12} />
                      Cerrar Caja
                    </button>
                  )}
                </div>
              </div>
            )}

            {sesion && (canMovManualPos || canCloseCajaPos) && <div className="border-t" />}

            {/* Cliente */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                Cliente
                <kbd className="rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F2</kbd>
              </label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <ClienteSelector
                    ref={clienteSelectorRef}
                    clienteId={clienteId}
                    onSelect={handleSelectCliente}
                    onClear={handleClearCliente}
                  />
                </div>
                {!clienteId && (
                  <button
                    type="button"
                    onClick={() => setShowNuevoClienteModal(true)}
                    title="Nuevo cliente rapido"
                    className="shrink-0 flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Plus size={13} />
                    Nuevo
                  </button>
                )}
              </div>
              {/* Info de credito del cliente seleccionado */}
              {clienteData && parseFloat(clienteData.limite_credito_usd) > 0 && (
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <span>Credito disponible</span>
                  <span className={`font-semibold ${
                    Math.max(0, parseFloat(clienteData.limite_credito_usd) - parseFloat(clienteData.saldo_actual)) < pendienteUsd - 0.01
                      ? 'text-destructive'
                      : 'text-green-600'
                  }`}>
                    {formatUsd(Math.max(0, parseFloat(clienteData.limite_credito_usd) - parseFloat(clienteData.saldo_actual)))}
                    {' / '}
                    <span className="font-normal">{formatUsd(parseFloat(clienteData.limite_credito_usd))}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* Totales */}
            <div className="space-y-1.5">
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

            <div className="border-t" />

            {/* Pagos */}
            <div className="space-y-3">
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
                      className="w-full rounded border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
                      className="w-full rounded border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Referencia (opcional)"
                    autoComplete="one-time-code"
                    className="flex-1 rounded border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
                    <kbd className="ml-1.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">Alt+A</kbd>
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
                            <Trash size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>

          {/* ── Footer sticky: acciones principales ── */}
          <div className="shrink-0 border-t bg-card p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleGuardarFactura}
                disabled={submitting || (lineas.length === 0 && cargosEspeciales.length === 0)}
                size="sm"
                className="w-full"
              >
                <FloppyDisk size={14} className="mr-1.5" />
                Guardar
                <kbd className="ml-1.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F8</kbd>
              </Button>
              <Button
                variant={esperaCount > 0 ? 'secondary' : 'outline'}
                onClick={() => setShowEsperaModal(true)}
                size="sm"
                className="w-full"
              >
                <ListBullets size={14} className="mr-1.5" />
                {esperaCount > 0 ? `Guardadas (${esperaCount})` : 'Guardadas'}
                <kbd className="ml-1.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">F9</kbd>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCancelar}
                disabled={submitting}
                size="sm"
                className="w-full"
              >
                Cancelar
                <kbd className="ml-1.5 rounded border bg-muted px-1 py-px text-[10px] font-mono leading-none">Esc</kbd>
              </Button>
              <Button
                onClick={handleConfirmVenta}
                disabled={!puedeConfirmar}
                size="sm"
                className={`w-full ${tipoDetectado === 'CREDITO' && tieneContenido && clienteId ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
              >
                {tipoDetectado === 'CREDITO' && tieneContenido && clienteId ? (
                  <CreditCard size={14} className="mr-1.5" />
                ) : (
                  <ShoppingCart size={14} className="mr-1.5" />
                )}
                {textoConfirmar}
                <kbd className="ml-1.5 rounded border bg-muted/40 px-1 py-px text-[10px] font-mono leading-none opacity-70">F10</kbd>
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* ── DIALOGS ── */}

      <VentaExitosaModal
        isOpen={!!ventaExitosa}
        data={ventaExitosa}
        onClose={() => setVentaExitosa(null)}
      />

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

      {/* Modales de caja desde POS */}
      {sesion && (
        <>
          <IngresoRetiroModal
            isOpen={showIngresoModal}
            onClose={() => setShowIngresoModal(false)}
            sesionCajaId={sesion.id}
            modo="INGRESO"
          />
          <IngresoRetiroModal
            isOpen={showRetiroModal}
            onClose={() => setShowRetiroModal(false)}
            sesionCajaId={sesion.id}
            modo="RETIRO"
          />
          <AvanceModal
            isOpen={showAvanceModal}
            onClose={() => setShowAvanceModal(false)}
            sesionCajaId={sesion.id}
            tasaActual={tasaValor}
            clienteNombre={clienteNombre || undefined}
            onAplicado={handleAvanceAplicado}
          />
          <PrestamoModal
            isOpen={showPrestamoModal}
            onClose={() => setShowPrestamoModal(false)}
            sesionCajaId={sesion.id}
            tasaActual={tasaValor}
            clienteNombre={clienteNombre || undefined}
            onAplicado={handlePrestamoAplicado}
          />
        </>
      )}

      {/* PIN para cerrar caja desde POS (si no tiene permiso directo) */}
      <SupervisorPinDialog
        isOpen={showCierrePosPin}
        onClose={() => setShowCierrePosPin(false)}
        onAuthorized={() => setShowCierrePos(true)}
        titulo="Cerrar Sesion de Caja"
        mensaje="Ingresa el PIN de supervisor para cerrar la sesion de caja."
        requiredPermission="caja.close"
      />

      {/* Formulario de cierre desde POS */}
      <SesionCajaForm
        mode="cierre"
        isOpen={showCierrePos}
        onClose={() => setShowCierrePos(false)}
        sesionId={sesion?.id}
      />
    </>
  )
}
