import { useEffect } from 'react'
import { Copy, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { CuentaContable } from '@/features/contabilidad/hooks/use-plan-cuentas'

// ─── Props ────────────────────────────────────────────────────

interface CuentaContextMenuProps {
  cuenta: CuentaContable
  position: { x: number; y: number }
  onClose: () => void
  onEditar: (cuenta: CuentaContable) => void
  onAgregarSubcuenta: (cuenta: CuentaContable) => void
}

// ─── Componente ───────────────────────────────────────────────

export function CuentaContextMenu({
  cuenta,
  position,
  onClose,
  onEditar,
  onAgregarSubcuenta,
}: CuentaContextMenuProps) {
  // Cerrar con Escape o click fuera del menu
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-context-menu]')) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  function handleCopiarCodigo() {
    navigator.clipboard.writeText(cuenta.codigo)
    toast.success('Codigo copiado')
    onClose()
  }

  function handleEditar() {
    onEditar(cuenta)
    onClose()
  }

  function handleAgregarSubcuenta() {
    onAgregarSubcuenta(cuenta)
    onClose()
  }

  return (
    <div
      data-context-menu
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
    >
      <button
        onClick={handleCopiarCodigo}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
      >
        <Copy className="h-3.5 w-3.5 text-gray-500" />
        Copiar codigo
      </button>

      <button
        onClick={handleEditar}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
      >
        <Pencil className="h-3.5 w-3.5 text-gray-500" />
        Editar
      </button>

      {cuenta.es_cuenta_detalle === 0 && (
        <button
          onClick={handleAgregarSubcuenta}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          <Plus className="h-3.5 w-3.5 text-gray-500" />
          Agregar Subcuenta
        </button>
      )}
    </div>
  )
}
