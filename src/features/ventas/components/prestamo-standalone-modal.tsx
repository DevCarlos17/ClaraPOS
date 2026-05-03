import { useState, useRef, useEffect } from 'react'
import { Handshake, Info, CashRegister, Vault, Bank, MagnifyingGlass, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useSesionesActivas, type SesionCajaConNombre } from '@/features/caja/hooks/use-sesiones-caja'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { crearPrestamoStandalone, type CrearPrestamoStandaloneParams } from '@/features/cxc/hooks/use-cxc'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────

type OrigenFondos = 'CAJA' | 'EFECTIVO_EMPRESA' | 'BANCO'

// ─── Constantes ───────────────────────────────────────────────

const DEFAULT_DIAS_PLAZO = 30
const DEFAULT_PORCENTAJE_INTERES = 5

// ─── Props ────────────────────────────────────────────────────

interface PrestamoStandaloneModalProps {
  isOpen: boolean
  onClose: () => void
  onCreado: () => void
}

// ─── ClienteSearchField ───────────────────────────────────────

function ClienteSearchField({
  value,
  onChange,
}: {
  value: Cliente | null
  onChange: (c: Cliente | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { clientes, isLoading } = useBuscarClientes(query)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 bg-gray-50">
        <div>
          <p className="text-sm font-medium">{value.nombre}</p>
          <p className="text-xs text-muted-foreground">{value.identificacion}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MagnifyingGlass
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente por nombre o cedula..."
          className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      {open && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
          {isLoading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>
          ) : clientes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            clientes.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(c)
                  setQuery('')
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 transition-colors"
              >
                <span className="font-medium">{c.nombre}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.identificacion}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Formulario ───────────────────────────────────────────────

function FormPrestamoStandalone({
  onClose,
  onCreado,
}: {
  onClose: () => void
  onCreado: () => void
}) {
  const { user } = useCurrentUser()
  const { isOwner, hasPermission } = usePermissions()
  const { tasaValor, isLoading: loadingTasa } = useTasaActual()
  const { sesiones: sesionesActivas, isLoading: loadingSesiones } = useSesionesActivas()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()

  const [sesionSeleccionadaId, setSesionSeleccionadaId] = useState<string | null>(null)

  const sesionEfectiva: SesionCajaConNombre | null =
    sesionesActivas.length === 1
      ? sesionesActivas[0]
      : sesionSeleccionadaId
        ? (sesionesActivas.find((s) => s.id === sesionSeleccionadaId) ?? null)
        : null

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [origenFondos, setOrigenFondos] = useState<OrigenFondos>('CAJA')
  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')
  const [porcentajeInteres, setPorcentajeInteres] = useState(String(DEFAULT_PORCENTAJE_INTERES))
  const [diasPlazo, setDiasPlazo] = useState(String(DEFAULT_DIAS_PLAZO))
  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const puedeModificarDias = isOwner || hasPermission(PERMISSIONS.CAJA_MOV_MANUAL)

  const efectivoUsd = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  const usd = parseFloat(montoUsd) || 0
  const bs = parseFloat(montoBs) || 0
  const interesPct = parseFloat(porcentajeInteres) || 0
  const dias = parseInt(diasPlazo) || DEFAULT_DIAS_PLAZO
  const tasa = tasaValor

  const bsEnUsd = tasa > 0 ? Number((bs / tasa).toFixed(2)) : 0
  const principalUsd = Number((usd + bsEnUsd).toFixed(2))
  const interesUsd = Number((principalUsd * interesPct / 100).toFixed(2))
  const totalDeudaUsd = Number((principalUsd + interesUsd).toFixed(2))
  const totalDeudaBs = usdToBs(totalDeudaUsd, tasa)

  function reset() {
    setCliente(null)
    setOrigenFondos('CAJA')
    setMontoUsd('')
    setMontoBs('')
    setPorcentajeInteres(String(DEFAULT_PORCENTAJE_INTERES))
    setDiasPlazo(String(DEFAULT_DIAS_PLAZO))
    setConcepto('')
    setErrors({})
    setSesionSeleccionadaId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (!cliente) newErrors.cliente = 'Selecciona un cliente'
    if (usd <= 0 && bs <= 0) {
      newErrors.general = 'Ingresa al menos un monto mayor a 0'
    }
    if (interesPct < 0 || interesPct > 100) {
      newErrors.interes = 'El interes debe estar entre 0 y 100'
    }
    if (dias < 1 || dias > 3650) {
      newErrors.dias = 'El plazo debe estar entre 1 y 3650 dias'
    }
    if (!concepto.trim() || concepto.trim().length < 3) {
      newErrors.concepto = 'El concepto debe tener al menos 3 caracteres'
    }
    if (origenFondos === 'CAJA') {
      if (!sesionEfectiva) {
        newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
          'Selecciona una sesion de caja activa'
      } else {
        if (usd > 0 && !efectivoUsd) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            'No hay metodo EFECTIVO en USD configurado'
        }
        if (bs > 0 && !efectivoBs) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            'No hay metodo EFECTIVO en Bs configurado'
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!user || !cliente) return

    const conceptoFinal = concepto.trim() ||
      `Prestamo - ${cliente.nombre} - ${dias} dias`

    setSubmitting(true)
    try {
      const p: CrearPrestamoStandaloneParams = {
        clienteId: cliente.id,
        empresaId: user.empresa_id!,
        montoPrestamoUsd: usd,
        montoPrestamoBs: bs,
        tasaActual: tasa,
        porcentajeInteres: interesPct,
        diasPlazo: dias,
        concepto: conceptoFinal,
        origenFondos,
        sesionCajaId: sesionEfectiva?.id ?? null,
        usuarioId: user.id,
      }
      await crearPrestamoStandalone(p)
      toast.success(`Prestamo registrado. Deuda: ${formatUsd(totalDeudaUsd)} en ${dias} dias`)
      reset()
      onCreado()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Cliente */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Cliente
        </label>
        <ClienteSearchField value={cliente} onChange={setCliente} />
        {errors.cliente && <p className="text-red-500 text-xs mt-1">{errors.cliente}</p>}
      </div>

      {/* Tasa vigente */}
      {loadingTasa ? (
        <div className="h-6 w-32 bg-muted/50 rounded animate-pulse" />
      ) : tasa > 0 ? (
        <p className="text-xs text-muted-foreground">
          Tasa vigente: <span className="font-medium">{tasa.toFixed(2)} Bs/USD</span>
        </p>
      ) : (
        <p className="text-xs text-amber-600">No se encontro la tasa de cambio</p>
      )}

      {/* Origen de fondos */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Origen de los fondos</p>
        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
          {([
            { key: 'CAJA' as OrigenFondos, label: 'Caja', Icon: CashRegister },
            { key: 'EFECTIVO_EMPRESA' as OrigenFondos, label: 'Efectivo empresa', Icon: Vault },
            { key: 'BANCO' as OrigenFondos, label: 'Banco', Icon: Bank },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrigenFondos(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors ${
                origenFondos === key
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={13} weight={origenFondos === key ? 'fill' : 'regular'} />
              {label}
            </button>
          ))}
        </div>
        {origenFondos === 'CAJA' && (
          <div className="mt-2">
            {loadingSesiones ? (
              <div className="h-9 bg-muted/50 rounded animate-pulse" />
            ) : sesionesActivas.length === 0 ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                No hay sesion de caja activa. Abre una sesion o selecciona otro origen.
              </p>
            ) : sesionesActivas.length === 1 ? (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                Sesion activa: <span className="font-medium">{sesionesActivas[0].caja_nombre ?? 'Caja sin nombre'}</span>
              </p>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Sesion de caja</label>
                <select
                  value={sesionSeleccionadaId ?? ''}
                  onChange={(e) => setSesionSeleccionadaId(e.target.value || null)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Seleccionar sesion...</option>
                  {sesionesActivas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.caja_nombre ?? 'Caja'} — Apertura: {s.fecha_apertura.slice(0, 10)}
                    </option>
                  ))}
                </select>
                {!sesionSeleccionadaId && (
                  <p className="text-xs text-amber-600">Selecciona la sesion de caja que prestara los fondos</p>
                )}
              </div>
            )}
          </div>
        )}
        {origenFondos !== 'CAJA' && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Los fondos no se descontaran de la caja activa. El modulo bancario esta pendiente de implementacion.
          </p>
        )}
      </div>

      {/* Montos */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          {origenFondos === 'CAJA' ? 'Monto del prestamo (de la caja)' : 'Monto del prestamo'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg border p-3 space-y-1 ${origenFondos === 'CAJA' && !efectivoUsd && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">USD</label>
              {origenFondos === 'CAJA' && efectivoUsd && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatUsd(parseFloat(efectivoUsd.saldo_actual || '0'))}
                </span>
              )}
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={montoUsd}
              onChange={(e) => setMontoUsd(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0.00"
              disabled={origenFondos === 'CAJA' && (!sesionEfectiva || (!efectivoUsd && !loadingMetodos))}
              className="no-spinner w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            />
            {origenFondos === 'CAJA' && !efectivoUsd && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>

          <div className={`rounded-lg border p-3 space-y-1 ${origenFondos === 'CAJA' && !efectivoBs && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Bs</label>
              {origenFondos === 'CAJA' && efectivoBs && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatBs(parseFloat(efectivoBs.saldo_actual || '0'))}
                </span>
              )}
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={montoBs}
              onChange={(e) => setMontoBs(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0.00"
              disabled={origenFondos === 'CAJA' && (!sesionEfectiva || (!efectivoBs && !loadingMetodos))}
              className="no-spinner w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            />
            {origenFondos === 'CAJA' && !efectivoBs && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Interes (%)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              value={porcentajeInteres}
              onChange={(e) => setPorcentajeInteres(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={`no-spinner w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                errors.interes ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
          {errors.interes && <p className="text-red-500 text-xs mt-1">{errors.interes}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plazo (dias)
          </label>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max="3650"
            value={diasPlazo}
            onChange={(e) => setDiasPlazo(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            disabled={!puedeModificarDias}
            className={`no-spinner w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
              errors.dias ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.dias && <p className="text-red-500 text-xs mt-1">{errors.dias}</p>}
          {!puedeModificarDias && (
            <p className="text-xs text-gray-400 mt-1">Solo supervisores pueden modificar el plazo</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Info size={12} />
        Los valores por defecto se configuraran desde Configuracion &gt; POS
      </p>

      {/* Resumen */}
      {principalUsd > 0 && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 space-y-1.5 text-sm">
          <p className="font-medium text-purple-900">Resumen del prestamo</p>
          <div className="flex justify-between text-purple-800">
            <span>Monto prestado</span>
            <span>{formatUsd(principalUsd)}</span>
          </div>
          {interesPct > 0 && (
            <div className="flex justify-between text-purple-800">
              <span>Interes ({interesPct}%)</span>
              <span>{formatUsd(interesUsd)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-purple-900 border-t border-purple-200 pt-1.5">
            <span>Total a devolver</span>
            <span>{formatUsd(totalDeudaUsd)} / {formatBs(totalDeudaBs)}</span>
          </div>
          <div className="flex justify-between text-xs text-purple-700">
            <span>Plazo</span>
            <span>{dias} dias</span>
          </div>
          {cliente && (
            <div className="flex justify-between text-xs text-purple-700">
              <span>Cliente</span>
              <span className="font-medium">{cliente.nombre}</span>
            </div>
          )}
        </div>
      )}

      {/* Concepto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={`Prestamo${cliente ? ` - ${cliente.nombre}` : ''} - ${dias} dias...`}
          rows={2}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none ${
            errors.concepto ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.concepto && <p className="text-red-500 text-xs mt-1">{errors.concepto}</p>}
      </div>

      {errors.general && (
        <p className="text-red-500 text-sm text-center rounded-md bg-red-50 p-2">{errors.general}</p>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting || (usd <= 0 && bs <= 0) || !cliente}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {submitting ? 'Registrando...' : 'Registrar Prestamo'}
        </Button>
      </div>
    </form>
  )
}

// ─── Modal ────────────────────────────────────────────────────

export function PrestamoStandaloneModal({
  isOpen,
  onClose,
  onCreado,
}: PrestamoStandaloneModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 shrink-0">
              <Handshake size={16} className="text-purple-600" />
            </div>
            <div>
              <DialogTitle>Nuevo Prestamo</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Entrega de efectivo en condicion de credito (sin factura asociada)
              </p>
            </div>
          </div>
        </DialogHeader>
        <FormPrestamoStandalone onClose={onClose} onCreado={onCreado} />
      </DialogContent>
    </Dialog>
  )
}
