import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Plus,
  PencilSimple,
  ToggleLeft,
  ToggleRight,
  CreditCard,
  FileText,
  Printer,
} from '@phosphor-icons/react'
import {
  useProveedores,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import { formatUsd } from '@/lib/currency'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'
import { ProveedorForm } from './proveedor-form'
import { ProveedorEstadoCuentaModal } from './proveedor-estado-cuenta-modal'

// ─── Sort helpers ────────────────────────────────────────────

type SortCol = 'rif' | 'razon_social' | 'telefono' | 'saldo_actual' | 'dias_credito'
type SortDir = 'asc' | 'desc'

function SortIndicator({ col, current, dir }: { col: SortCol; current: SortCol; dir: SortDir }) {
  if (col !== current) return <span className="ml-1 opacity-30">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>
}

// ─── Print helper ────────────────────────────────────────────

function printProveedores(list: Proveedor[], mostrarSaldo: boolean) {
  const rows = list
    .map(
      (p) =>
        `<tr>
          <td>${p.rif}</td>
          <td>${p.razon_social}</td>
          <td>${p.telefono ?? ''}</td>
          ${mostrarSaldo ? `<td style="text-align:right">${parseFloat(p.saldo_actual).toFixed(2)}</td>` : ''}
        </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Listado de Proveedores</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h2 { margin: 0 0 16px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; font-weight: 600; }
    th, td { border: 1px solid #e5e7eb; padding: 7px 10px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h2>Listado de Proveedores</h2>
  <table>
    <thead>
      <tr>
        <th>RIF</th>
        <th>Razon Social</th>
        <th>Telefono</th>
        ${mostrarSaldo ? '<th style="text-align:right">Saldo (USD)</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:16px;font-size:11px;color:#9ca3af">
    Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
  </p>
</body>
</html>`

  const w = window.open('', '_blank', 'width=820,height=640')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

// ─── Componente principal ────────────────────────────────────

export function ProveedorList() {
  const { proveedores, isLoading } = useProveedores()
  const navigate = useNavigate()

  const [formOpen, setFormOpen] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('saldo_actual')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Search
  const [searchText, setSearchText] = useState('')

  // Print multi-select
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mostrarSaldo, setMostrarSaldo] = useState(true)

  // Estado de cuenta modal
  const [estadoCuentaProveedor, setEstadoCuentaProveedor] = useState<Proveedor | null>(null)

  function handleNuevo() {
    setEditingProveedor(undefined)
    setFormOpen(true)
  }

  function handleEditar(proveedor: Proveedor) {
    setEditingProveedor(proveedor)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingProveedor(undefined)
  }

  async function handleToggleActivo(proveedor: Proveedor) {
    const nuevoEstado = proveedor.is_active !== 1
    setTogglingId(proveedor.id)
    try {
      await actualizarProveedor(proveedor.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Proveedor activado' : 'Proveedor desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  function toggleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelected(new Set())
  }

  const filteredAndSorted = useMemo(() => {
    const lower = searchText.toLowerCase()
    const filtered = proveedores.filter(
      (p) =>
        !lower ||
        p.rif.toLowerCase().includes(lower) ||
        p.razon_social.toLowerCase().includes(lower) ||
        (p.nombre_comercial ?? '').toLowerCase().includes(lower)
    )

    return [...filtered].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortCol === 'saldo_actual' || sortCol === 'dias_credito') {
        const va = parseFloat(String(a[sortCol])) || 0
        const vb = parseFloat(String(b[sortCol])) || 0
        return (va - vb) * mult
      }
      const va = String(a[sortCol] ?? '')
      const vb = String(b[sortCol] ?? '')
      return va.localeCompare(vb) * mult
    })
  }, [proveedores, searchText, sortCol, sortDir])

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

  const thBtn = (_col: SortCol) =>
    `text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground`

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6">
      {/* Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground">Proveedores</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Buscar por RIF o nombre..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="rounded-md border border-input px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
          <button
            onClick={() => { setSelectionMode(true); setSelected(new Set()) }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={handleNuevo}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nuevo Proveedor
          </button>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">
            {searchText ? 'Sin resultados para la busqueda' : 'No hay proveedores registrados'}
          </p>
          {!searchText && (
            <p className="text-sm mt-1">Crea el primer proveedor para comenzar</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                {selectionMode && (
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredAndSorted.length && filteredAndSorted.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(filteredAndSorted.map((p) => p.id)))
                        else setSelected(new Set())
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                  </th>
                )}
                <th className={thBtn('rif')} onClick={() => toggleSort('rif')}>
                  RIF <SortIndicator col="rif" current={sortCol} dir={sortDir} />
                </th>
                <th className={thBtn('razon_social')} onClick={() => toggleSort('razon_social')}>
                  Razon Social <SortIndicator col="razon_social" current={sortCol} dir={sortDir} />
                </th>
                <th className={`${thBtn('telefono')} hidden md:table-cell`} onClick={() => toggleSort('telefono')}>
                  Telefono <SortIndicator col="telefono" current={sortCol} dir={sortDir} />
                </th>
                <th className={`${thBtn('saldo_actual')} hidden sm:table-cell`} onClick={() => toggleSort('saldo_actual')}>
                  Saldo <SortIndicator col="saldo_actual" current={sortCol} dir={sortDir} />
                </th>
                <th className={`${thBtn('dias_credito')} hidden xl:table-cell`} onClick={() => toggleSort('dias_credito')}>
                  Credito <SortIndicator col="dias_credito" current={sortCol} dir={sortDir} />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map((prov) => {
                const menuItems: ContextMenuAction[] = [
                  {
                    key: 'editar',
                    label: 'Editar',
                    icon: PencilSimple,
                    onClick: () => handleEditar(prov),
                  },
                  {
                    key: 'toggle',
                    label: prov.is_active === 1 ? 'Desactivar' : 'Activar',
                    icon: prov.is_active === 1 ? ToggleLeft : ToggleRight,
                    onClick: () => handleToggleActivo(prov),
                    separator: true,
                  },
                ]
                const isSelected = selected.has(prov.id)
                return (
                  <TableRowContextMenu key={prov.id} items={menuItems}>
                    <tr
                      className={`border-b border-border hover:bg-muted/50 transition-colors ${
                        selectionMode && isSelected ? 'bg-primary/5' : ''
                      }`}
                    >
                      {selectionMode && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(prov.id)}
                            className="h-4 w-4 rounded border-input"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{prov.rif}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{prov.razon_social}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{prov.telefono || '-'}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`font-medium tabular-nums text-sm ${parseFloat(prov.saldo_actual) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {formatUsd(prov.saldo_actual)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-foreground text-xs">
                          {prov.dias_credito > 0 ? `${prov.dias_credito}d` : '—'}
                        </span>
                        {parseFloat(prov.limite_credito_usd) > 0 && (
                          <span className="block text-muted-foreground text-xs">
                            {formatUsd(prov.limite_credito_usd)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActivo(prov)}
                          disabled={togglingId === prov.id}
                          className="disabled:opacity-50 cursor-pointer"
                        >
                          {prov.is_active === 1 ? (
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() =>
                              navigate({
                                to: '/compras/cxp',
                                search: { proveedorId: prov.id },
                              })
                            }
                            title="Ver Cuentas por Pagar"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            CxP
                          </button>
                          <button
                            onClick={() => setEstadoCuentaProveedor(prov)}
                            title="Estado de Cuenta"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Estado
                          </button>
                          <button
                            onClick={() => handleEditar(prov)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          >
                            <PencilSimple className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  </TableRowContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra flotante de seleccion */}
      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-background border border-border shadow-2xl px-5 py-3">
          <span className="text-sm font-medium text-foreground">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarSaldo}
              onChange={(e) => setMostrarSaldo(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Mostrar saldo
          </label>
          <button
            disabled={selected.size === 0}
            onClick={() => {
              const lista = filteredAndSorted.filter((p) => selected.has(p.id))
              printProveedores(lista, mostrarSaldo)
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Imprimir seleccionados
          </button>
          <button
            onClick={exitSelectionMode}
            className="px-4 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      <ProveedorForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        proveedor={editingProveedor}
      />

      {estadoCuentaProveedor && (
        <ProveedorEstadoCuentaModal
          proveedor={estadoCuentaProveedor}
          isOpen={true}
          onClose={() => setEstadoCuentaProveedor(null)}
        />
      )}
    </div>
  )
}
