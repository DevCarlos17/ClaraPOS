import { useState } from 'react'
import { Check, CaretDown, CaretRight } from '@phosphor-icons/react'
import type { Permiso } from '@/features/configuracion/hooks/use-roles'

interface PermisosReadonlyProps {
  mode: 'readonly'
  permisosAgrupados: Record<string, Permiso[]>
}

interface PermisosEditableProps {
  mode: 'editable'
  permisosByModule: Record<string, Permiso[]>
  selectedIds: Set<string>
  onChange: (ids: Set<string>) => void
}

type PermisosDisplayProps = PermisosReadonlyProps | PermisosEditableProps

export function PermisosDisplay(props: PermisosDisplayProps) {
  if (props.mode === 'readonly') {
    return <PermisosReadonly permisosAgrupados={props.permisosAgrupados} />
  }

  return (
    <PermisosEditable
      permisosByModule={props.permisosByModule}
      selectedIds={props.selectedIds}
      onChange={props.onChange}
    />
  )
}

function PermisosReadonly({
  permisosAgrupados,
}: {
  permisosAgrupados: Record<string, Permiso[]>
}) {
  if (Object.keys(permisosAgrupados).length === 0) {
    return <p className="text-sm text-gray-400">Sin permisos asignados</p>
  }

  const totalPermisos = Object.values(permisosAgrupados).reduce((s, p) => s + p.length, 0)

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        {totalPermisos} {totalPermisos === 1 ? 'permiso' : 'permisos'} en{' '}
        {Object.keys(permisosAgrupados).length}{' '}
        {Object.keys(permisosAgrupados).length === 1 ? 'modulo' : 'modulos'}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {Object.entries(permisosAgrupados).map(([modulo, permisos]) => (
          <div key={modulo} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-900">
                {modulo}
              </span>
              <span className="text-[10px] text-gray-400">{permisos.length}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {permisos.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200"
                >
                  <Check className="h-3 w-3 text-gray-400" />
                  {p.nombre}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PermisosEditable({
  permisosByModule,
  selectedIds,
  onChange,
}: {
  permisosByModule: Record<string, Permiso[]>
  selectedIds: Set<string>
  onChange: (ids: Set<string>) => void
}) {
  // Start collapsed
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  function toggleExpand(modulo: string) {
    const next = new Set(expandedModules)
    if (next.has(modulo)) {
      next.delete(modulo)
    } else {
      next.add(modulo)
    }
    setExpandedModules(next)
  }

  function handleToggle(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange(next)
  }

  function handleToggleModule(modulePermisos: Permiso[]) {
    const allSelected = modulePermisos.every((p) => selectedIds.has(p.id))
    const next = new Set(selectedIds)
    for (const p of modulePermisos) {
      if (allSelected) {
        next.delete(p.id)
      } else {
        next.add(p.id)
      }
    }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {Object.entries(permisosByModule).map(([modulo, permisos]) => {
        const allSelected = permisos.every((p) => selectedIds.has(p.id))
        const someSelected = permisos.some((p) => selectedIds.has(p.id))
        const selectedCount = permisos.filter((p) => selectedIds.has(p.id)).length
        const isExpanded = expandedModules.has(modulo)

        return (
          <div
            key={modulo}
            className={`rounded-lg border transition-colors ${
              someSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
            }`}
          >
            {/* Module header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleExpand(modulo)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              >
                {isExpanded ? (
                  <CaretDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
                <span
                  className={`text-sm font-semibold ${someSelected ? 'text-blue-900' : 'text-gray-700'}`}
                >
                  {modulo}
                </span>
              </button>
              <span className="text-xs text-gray-400 shrink-0">
                {selectedCount}/{permisos.length}
              </span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected
                  }}
                  onChange={() => handleToggleModule(permisos)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            {/* Permissions list */}
            {isExpanded && (
              <div className="px-3 pb-2.5 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {permisos.map((p) => {
                    const isChecked = selectedIds.has(p.id)
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-white ring-1 ring-blue-200'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(p.id)}
                          className="sr-only"
                        />
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span
                          className={`text-sm ${isChecked ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                        >
                          {p.nombre}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
