import { Check, Plus, Shield } from '@phosphor-icons/react'
import type { Rol } from '@/features/configuracion/hooks/use-roles'

interface RoleCardSelectorProps {
  roles: Rol[]
  selectedRolId: string
  onSelect: (rolId: string) => void
  isCustom: boolean
  onCustomToggle: () => void
}

export function RoleCardSelector({
  roles,
  selectedRolId,
  onSelect,
  isCustom,
  onCustomToggle,
}: RoleCardSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {roles.map((rol) => {
        const isSelected = !isCustom && selectedRolId === rol.id
        return (
          <button
            key={rol.id}
            type="button"
            onClick={() => onSelect(rol.id)}
            className={`relative flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-all hover:shadow-sm ${
              isSelected
                ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {isSelected && (
              <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Shield className={`h-4.5 w-4.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                {rol.nombre}
              </span>
            </div>
            {rol.descripcion && (
              <p className="text-xs text-gray-500 line-clamp-2">{rol.descripcion}</p>
            )}
          </button>
        )
      })}

      {/* Card personalizado */}
      <button
        type="button"
        onClick={onCustomToggle}
        className={`relative flex flex-col items-start gap-1.5 rounded-lg border-2 border-dashed p-4 text-left transition-all hover:shadow-sm ${
          isCustom
            ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {isCustom && (
          <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Plus className={`h-4.5 w-4.5 ${isCustom ? 'text-blue-600' : 'text-gray-400'}`} />
          <span className={`text-sm font-semibold ${isCustom ? 'text-blue-900' : 'text-gray-700'}`}>
            Personalizado
          </span>
        </div>
        <p className="text-xs text-gray-500">Crea un rol con permisos a medida</p>
      </button>
    </div>
  )
}
