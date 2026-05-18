import { useState } from 'react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCitaWizardStore } from '@/stores/cita-wizard-store'
import { useBuscarClientes } from '@/features/clientes/hooks/use-clientes'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  MagnifyingGlass,
  User,
  CheckCircle,
  Plus,
  Minus,
  Clock,
  ArrowsLeftRight,
} from '@phosphor-icons/react'

const DURACION_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120]

function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`
  if (min === 60) return '1 hora'
  if (min === 120) return '2 horas'
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

export function StepServicios() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [busqueda, setBusqueda] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')

  const {
    clienteId,
    clienteNombre,
    servicios,
    ejecucionParalela,
    setCliente,
    agregarServicio,
    quitarServicio,
    actualizarDuracionServicio,
    toggleParalela,
    totalUsd,
    duracionTotalMin,
  } = useCitaWizardStore()

  const { clientes } = useBuscarClientes(busqueda)

  const { data } = useQuery(
    empresaId
      ? `SELECT id, nombre, precio_venta_usd, duracion_min FROM productos WHERE empresa_id = ? AND tipo = 'S' AND is_active = 1 ORDER BY nombre`
      : '',
    empresaId ? [empresaId] : []
  )

  const productos = (data ?? []) as { id: string; nombre: string; precio_venta_usd: string; duracion_min: number | null }[]
  const serviciosIds = new Set(servicios.map((s) => s.productoId))

  const productosFiltrados = filtroBusqueda
    ? productos.filter((p) => p.nombre.toLowerCase().includes(filtroBusqueda.toLowerCase()))
    : productos

  const toggle = (p: { id: string; nombre: string; precio_venta_usd: string; duracion_min: number | null }) => {
    if (serviciosIds.has(p.id)) {
      quitarServicio(p.id)
    } else {
      agregarServicio({
        productoId: p.id,
        nombre: p.nombre,
        precioUsd: parseFloat(p.precio_venta_usd),
        duracionMin: p.duracion_min ?? 60,
      })
    }
  }

  const seleccionarCliente = (id: string, nombre: string) => {
    setCliente(id, nombre)
    setBusqueda('')
  }

  return (
    <div className="space-y-6">
      {/* Buscar cliente */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Cliente</label>
        {clienteId ? (
          <div className="flex items-center gap-2 p-3 border rounded-xl bg-primary/5 border-primary/30">
            <CheckCircle size={18} className="text-primary shrink-0" />
            <span className="font-medium">{clienteNombre}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCliente('', '')}
              className="ml-auto h-7 text-xs"
            >
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Buscar por nombre o identificacion (min. 2 caracteres)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
            {clientes.length > 0 && busqueda.length >= 2 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {clientes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => seleccionarCliente(c.id, c.nombre)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted text-left text-sm transition-colors"
                  >
                    <User size={14} className="text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-xs text-muted-foreground">{c.identificacion}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {busqueda.length >= 2 && clientes.length === 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border rounded-xl shadow-lg p-3 text-sm text-muted-foreground text-center">
                No se encontraron clientes
              </div>
            )}
          </div>
        )}
      </div>

      {/* Catalogo de servicios */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Servicios</label>

        {/* Filtro de busqueda */}
        {productos.length > 5 && (
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Filtrar servicios..."
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}

        {productosFiltrados.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border rounded-xl">
            {productos.length === 0
              ? 'No hay servicios disponibles. Agrega productos de tipo Servicio en Inventario.'
              : 'No hay servicios que coincidan con la busqueda.'}
          </div>
        ) : (
          <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
            {productosFiltrados.map((p) => {
              const sel = serviciosIds.has(p.id)
              const servicioActual = servicios.find((s) => s.productoId === p.id)
              return (
                <div key={p.id} className="space-y-2">
                  <button
                    onClick={() => toggle(p)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left w-full',
                      sel
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all',
                        sel ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      {sel ? <Minus size={14} /> : <Plus size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatUsd(parseFloat(p.precio_venta_usd))}
                      </div>
                    </div>
                    {sel && <CheckCircle size={18} className="text-primary shrink-0" />}
                  </button>

                  {/* Selector de duracion por servicio seleccionado */}
                  {sel && servicioActual && (
                    <div className="ml-11 flex items-center gap-2">
                      <Clock size={12} className="text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">Duracion:</span>
                      <Select
                        value={String(servicioActual.duracionMin)}
                        onValueChange={(val) => actualizarDuracionServicio(p.id, parseInt(val))}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURACION_OPTIONS.map((min) => (
                            <SelectItem key={min} value={String(min)} className="text-xs">
                              {formatDuracion(min)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Control de ejecucion paralela */}
      {servicios.length > 1 && (
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
            ejecucionParalela
              ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
              : 'border-border hover:border-muted-foreground/30'
          )}
          onClick={toggleParalela}
        >
          <ArrowsLeftRight
            size={20}
            className={ejecucionParalela ? 'text-violet-600' : 'text-muted-foreground'}
          />
          <div className="flex-1">
            <div className="text-sm font-medium">Ejecucion Simultanea</div>
            <div className="text-xs text-muted-foreground">
              {ejecucionParalela
                ? 'Los servicios se realizan en paralelo por diferentes profesionales'
                : 'Los servicios se realizan uno tras otro por el mismo profesional'}
            </div>
          </div>
          <div
            className={cn(
              'w-10 h-5 rounded-full transition-all relative',
              ejecucionParalela ? 'bg-violet-600' : 'bg-border'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                ejecucionParalela ? 'left-5' : 'left-0.5'
              )}
            />
          </div>
        </div>
      )}

      {/* Total y duracion estimada */}
      {servicios.length > 0 && (
        <div className="border-t pt-3 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {servicios.length} servicio{servicios.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock size={13} />
                {duracionTotalMin()} min
                {ejecucionParalela && servicios.length > 1 && (
                  <span className="text-xs text-violet-600">(paralelo)</span>
                )}
              </span>
              <span className="font-semibold text-primary">{formatUsd(totalUsd())}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
