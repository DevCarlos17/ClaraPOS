import { useMemo, useState } from 'react'
import { CaretDown, CaretRight, Copy, Download, PencilSimple, Plus, Upload } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  usePlanCuentas,
  actualizarCuenta,
  type CuentaContable,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { TableRowContextMenu, type ContextMenuAction } from '@/components/shared/table-row-context-menu'
import { CuentaForm } from './cuenta-form'
import { PlanCuentasImport } from './plan-cuentas-import'
import {
  exportPlanCuentasCsv,
  downloadCsv,
} from '@/features/contabilidad/lib/plan-cuentas-csv'

// ─── Badge de tipo ─────────────────────────────────────────────

const TIPO_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  ACTIVO:     { bg: 'bg-blue-50',   text: 'text-blue-700',   ring: 'ring-blue-600/20' },
  PASIVO:     { bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-600/20' },
  PATRIMONIO: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/20' },
  INGRESO:    { bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-600/20' },
  COSTO:      { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/20' },
  GASTO:      { bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-600/20' },
}

function TipoBadge({ tipo }: { tipo: string }) {
  const colors = TIPO_COLORS[tipo] ?? { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/20' }
  return (
    <span className={`inline-flex items-center rounded-full ${colors.bg} px-2.5 py-0.5 text-xs font-medium ${colors.text} ring-1 ${colors.ring} ring-inset`}>
      {tipo}
    </span>
  )
}

function NaturalezaBadge({ naturaleza }: { naturaleza: string }) {
  if (naturaleza === 'DEUDORA') {
    return (
      <span className="inline-flex items-center rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-cyan-700 ring-1 ring-cyan-600/20 ring-inset">
        DEUDORA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20 ring-inset">
      ACREEDORA
    </span>
  )
}

function DetalleBadge({ esCuentaDetalle }: { esCuentaDetalle: number }) {
  if (esCuentaDetalle === 1) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
        Detalle
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
      Grupo
    </span>
  )
}

function TablaSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────

export function PlanCuentasList() {
  const { cuentas, isLoading } = usePlanCuentas()
  const { user } = useCurrentUser()

  // ─── Estado del formulario ───────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | undefined>(undefined)
  const [parentPreset, setParentPreset] = useState<CuentaContable | undefined>(undefined)

  // ─── Estado del toggle activo ────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ─── Estado del arbol ────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // ─── Estado del dialogo de importacion ───────────────────────
  const [importOpen, setImportOpen] = useState(false)

  // ─── Mapa de hijos: parent_id -> hijos directos ───────────────
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, CuentaContable[]>()
    for (const c of cuentas) {
      const key = c.parent_id ?? null
      const existing = map.get(key)
      if (existing) {
        existing.push(c)
      } else {
        map.set(key, [c])
      }
    }
    return map
  }, [cuentas])

  // ─── Lista visible: recorrido en profundidad desde raices ────
  const visibleCuentas = useMemo(() => {
    const result: CuentaContable[] = []

    function walk(parentId: string | null) {
      const children = childrenMap.get(parentId) ?? []
      for (const c of children) {
        result.push(c)
        // Solo mostrar hijos si este nodo esta expandido y es un grupo
        if (c.es_cuenta_detalle === 0 && expandedIds.has(c.id)) {
          walk(c.id)
        }
      }
    }

    walk(null)
    return result
  }, [childrenMap, expandedIds])

  // ─── Todos los IDs de cuentas grupo (para expandir todo) ─────
  const allGroupIds = useMemo(
    () => cuentas.filter((c) => c.es_cuenta_detalle === 0).map((c) => c.id),
    [cuentas]
  )

  // ─── Acciones del formulario ──────────────────────────────────

  function handleNueva() {
    setEditingCuenta(undefined)
    setParentPreset(undefined)
    setFormOpen(true)
  }

  function handleEditar(cuenta: CuentaContable) {
    setEditingCuenta(cuenta)
    setParentPreset(undefined)
    setFormOpen(true)
  }

  function handleAgregarSubcuenta(cuenta: CuentaContable) {
    setEditingCuenta(undefined)
    setParentPreset(cuenta)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingCuenta(undefined)
    setParentPreset(undefined)
  }

  // ─── Toggle activo ────────────────────────────────────────────

  async function handleToggleActivo(cuenta: CuentaContable) {
    const nuevoEstado = cuenta.is_active !== 1
    setTogglingId(cuenta.id)
    try {
      await actualizarCuenta(cuenta.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Cuenta activada' : 'Cuenta desactivada')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  // ─── Arbol: expandir / contraer ───────────────────────────────

  function handleToggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleExpandAll() {
    setExpandedIds(new Set(allGroupIds))
  }

  function handleCollapseAll() {
    setExpandedIds(new Set())
  }

  // ─── Exportar CSV ─────────────────────────────────────────────

  function handleExportarCsv() {
    const csv = exportPlanCuentasCsv(cuentas)
    downloadCsv(csv, 'plan_cuentas.csv')
    toast.success('Plan de cuentas exportado')
  }

  if (isLoading) {
    return <TablaSkeleton />
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Plan de Cuentas
          <span className="text-sm font-normal text-gray-500 ml-2">({cuentas.length})</span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Expandir / contraer todo */}
          {cuentas.length > 0 && (
            <>
              <button
                onClick={handleExpandAll}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Expandir todo
              </button>
              <button
                onClick={handleCollapseAll}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Contraer todo
              </button>
            </>
          )}

          {/* Exportar / Importar CSV */}
          <button
            onClick={handleExportarCsv}
            disabled={cuentas.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar CSV
          </button>

          {/* Nueva cuenta */}
          <button
            onClick={handleNueva}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </button>
        </div>
      </div>

      {/* Tabla / estado vacio */}
      {cuentas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay cuentas registradas</p>
          <p className="text-sm mt-1">Crea la primera cuenta para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Codigo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Naturaleza</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nivel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleCuentas.map((c) => {
                const hasChildren = (childrenMap.get(c.id)?.length ?? 0) > 0
                const isExpanded = expandedIds.has(c.id)
                const isGroup = c.es_cuenta_detalle === 0
                const menuItems: ContextMenuAction[] = [
                  {
                    key: 'copiar',
                    label: 'Copiar codigo',
                    icon: Copy,
                    onClick: () => {
                      void navigator.clipboard.writeText(c.codigo)
                      toast.success('Codigo copiado')
                    },
                  },
                  {
                    key: 'editar',
                    label: 'Editar',
                    icon: PencilSimple,
                    onClick: () => handleEditar(c),
                    separator: true,
                  },
                  {
                    key: 'subcuenta',
                    label: 'Agregar Subcuenta',
                    icon: Plus,
                    onClick: () => handleAgregarSubcuenta(c),
                    hidden: c.es_cuenta_detalle !== 0,
                  },
                ]

                return (
                  <TableRowContextMenu key={c.id} items={menuItems}>
                  <tr
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-default"
                  >
                    {/* Codigo con sangria por nivel y boton de expansion */}
                    <td
                      className="px-4 py-3"
                      style={{ paddingLeft: `${8 + (c.nivel - 1) * 20}px` }}
                    >
                      <div className="flex items-center gap-1">
                        {isGroup ? (
                          <button
                            onClick={() => handleToggleExpand(c.id)}
                            className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-gray-200 transition-colors text-gray-400"
                            aria-label={isExpanded ? 'Contraer' : 'Expandir'}
                          >
                            {hasChildren ? (
                              isExpanded ? (
                                <CaretDown className="h-3.5 w-3.5" />
                              ) : (
                                <CaretRight className="h-3.5 w-3.5" />
                              )
                            ) : (
                              // Espacio reservado para alinear cuentas sin hijos
                              <span className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          // Sangria adicional para cuentas de detalle (sin boton)
                          <span className="flex-shrink-0 h-5 w-5" />
                        )}
                        <span
                          className={`font-mono text-gray-900 ${
                            isGroup ? 'font-bold' : 'font-normal'
                          }`}
                        >
                          {c.codigo}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-900">{c.nombre}</td>

                    <td className="px-4 py-3">
                      <TipoBadge tipo={c.tipo} />
                    </td>

                    <td className="px-4 py-3">
                      <NaturalezaBadge naturaleza={c.naturaleza} />
                    </td>

                    <td className="px-4 py-3">
                      <DetalleBadge esCuentaDetalle={c.es_cuenta_detalle} />
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActivo(c)}
                        disabled={togglingId === c.id}
                        className="disabled:opacity-50"
                      >
                        {c.is_active === 1 ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                            Inactiva
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEditar(c)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        <PencilSimple className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                  </TableRowContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogo de creacion / edicion */}
      <CuentaForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        cuenta={editingCuenta}
        cuentas={cuentas}
        parentPreset={parentPreset}
      />

      {/* Dialogo de importacion CSV */}
      <PlanCuentasImport
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        cuentas={cuentas}
        empresaId={user?.empresa_id ?? ''}
        userId={user?.id ?? ''}
      />
    </div>
  )
}
