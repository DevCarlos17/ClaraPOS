import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, Eye, MagnifyingGlass, ToggleLeft, ToggleRight } from '@phosphor-icons/react'
import {
  useClientes,
  actualizarCliente,
  tieneMovimientos,
  type Cliente,
} from '@/features/clientes/hooks/use-clientes'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'
import { ClienteForm } from './cliente-form'
import { ClienteDetalle } from './cliente-detalle'

export function ClienteList() {
  const { clientes, isLoading } = useClientes()
  const { tasaValor } = useTasaActual()
  const [formOpen, setFormOpen] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | undefined>(undefined)
  const [detalleCliente, setDetalleCliente] = useState<Cliente | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroActivos, setFiltroActivos] = useState(false)
  const [searchActive, setSearchActive] = useState(false)

  const clientesFiltrados = useMemo(() => {
    let resultado = clientes
    if (filtroActivos) {
      resultado = resultado.filter((c) => c.is_active === 1)
    }
    if (busqueda.trim().length >= 2) {
      const term = busqueda.toUpperCase()
      resultado = resultado.filter(
        (c) =>
          c.identificacion.toUpperCase().includes(term) ||
          c.nombre.toUpperCase().includes(term)
      )
    }
    return resultado
  }, [clientes, busqueda, filtroActivos])

  const resumen = useMemo(() => {
    const activos = clientes.filter((c) => c.is_active === 1)
    const totalSaldo = activos.reduce(
      (sum, c) => sum + parseFloat(c.saldo_actual || '0'),
      0
    )
    return { totalActivos: activos.length, totalSaldo }
  }, [clientes])

  function handleNuevo() {
    setEditingCliente(undefined)
    setFormOpen(true)
  }

  function handleEditar(cliente: Cliente) {
    setEditingCliente(cliente)
    setFormOpen(true)
  }

  function handleVerDetalle(cliente: Cliente) {
    setDetalleCliente(cliente)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingCliente(undefined)
  }

  async function handleToggleActivo(cliente: Cliente) {
    const nuevoEstado = cliente.is_active !== 1

    if (!nuevoEstado) {
      setTogglingId(cliente.id)
      try {
        const tiene = await tieneMovimientos(cliente.id)
        if (tiene && parseFloat(cliente.saldo_actual) !== 0) {
          toast.error('No se puede desactivar: tiene saldo pendiente')
          return
        }
        await actualizarCliente(cliente.id, { is_active: false })
        toast.success('Cliente desactivado')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setTogglingId(null)
      }
    } else {
      setTogglingId(cliente.id)
      try {
        await actualizarCliente(cliente.id, { is_active: true })
        toast.success('Cliente activado')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setTogglingId(null)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cards Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-card shadow-lg p-4">
          <p className="text-sm text-muted-foreground">Clientes Activos</p>
          <p className="text-2xl font-bold text-foreground">{resumen.totalActivos}</p>
        </div>
        <div className="rounded-2xl bg-card shadow-lg p-4">
          <p className="text-sm text-muted-foreground">Saldo Total Pendiente</p>
          <p className="text-2xl font-bold text-foreground">{formatUsd(resumen.totalSaldo)}</p>
          {tasaValor > 0 && (
            <p className="text-sm text-muted-foreground">{formatBs(usdToBs(resumen.totalSaldo, tasaValor))}</p>
          )}
        </div>
      </div>

      {/* Lista + Detalle en split layout cuando hay seleccion */}
      <div className={detalleCliente ? 'grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-4 items-start' : ''}>
        {/* Card principal: toolbar + tabla */}
        <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
                <div className="relative flex-1 sm:max-w-xs">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={busqueda}
                    readOnly={!searchActive}
                    onFocus={() => setSearchActive(true)}
                    onBlur={() => setSearchActive(false)}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre o identificacion..."
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={filtroActivos}
                    onChange={(e) => setFiltroActivos(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  Solo activos
                </label>
              </div>
              <button
                onClick={handleNuevo}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Nuevo Cliente
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            {clientesFiltrados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-base font-medium">
                  {clientes.length === 0
                    ? 'No hay clientes registrados'
                    : 'No se encontraron resultados'}
                </p>
                <p className="text-sm mt-1">
                  {clientes.length === 0
                    ? 'Crea el primer cliente para comenzar'
                    : 'Intenta con otro termino de busqueda'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Identificacion</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre / Razon Social</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Telefono</th>
                    <th className={`text-right px-4 py-3 font-medium text-muted-foreground ${detalleCliente ? 'hidden' : ''}`}>Limite</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
                    <th className={`text-left px-4 py-3 font-medium text-muted-foreground ${detalleCliente ? 'hidden' : ''}`}>Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((cli) => {
                    const saldo = parseFloat(cli.saldo_actual || '0')
                    const isSelected = detalleCliente?.id === cli.id
                    const menuItems: ContextMenuAction[] = [
                      {
                        key: 'ver-detalle',
                        label: 'Ver detalle',
                        icon: Eye,
                        onClick: () => handleVerDetalle(cli),
                      },
                      {
                        key: 'editar',
                        label: 'Editar',
                        icon: PencilSimple,
                        onClick: () => handleEditar(cli),
                        separator: true,
                      },
                      {
                        key: 'toggle',
                        label: cli.is_active === 1 ? 'Desactivar' : 'Activar',
                        icon: cli.is_active === 1 ? ToggleLeft : ToggleRight,
                        onClick: () => handleToggleActivo(cli),
                      },
                    ]
                    return (
                      <TableRowContextMenu key={cli.id} items={menuItems}>
                      <tr
                        className={`border-b border-border transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => handleVerDetalle(cli)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{cli.identificacion}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{cli.nombre}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          {cli.telefono || '-'}
                        </td>
                        <td className={`px-4 py-3 text-right text-muted-foreground ${detalleCliente ? 'hidden' : ''}`}>
                          {formatUsd(cli.limite_credito_usd)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatUsd(saldo)}
                        </td>
                        <td className={`px-4 py-3 ${detalleCliente ? 'hidden' : ''}`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleActivo(cli)
                            }}
                            disabled={togglingId === cli.id}
                            className="disabled:opacity-50 cursor-pointer"
                          >
                            {cli.is_active === 1 ? (
                              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                                Inactivo
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!detalleCliente && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleVerDetalle(cli)
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                                title="Ver detalle"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditar(cli)
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <PencilSimple className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      </TableRowContextMenu>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Panel de detalle (inline, sticky) */}
        {detalleCliente && (
          <ClienteDetalle
            cliente={detalleCliente}
            onClose={() => setDetalleCliente(undefined)}
          />
        )}
      </div>

      <ClienteForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        cliente={editingCliente}
      />
    </div>
  )
}
