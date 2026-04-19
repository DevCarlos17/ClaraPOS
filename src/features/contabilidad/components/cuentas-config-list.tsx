import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useCuentasConfig, actualizarCuentaConfig } from '@/features/contabilidad/hooks/use-cuentas-config'
import { useCuentasDetalle } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { CLAVES_CONFIG } from '@/features/contabilidad/schemas/cuentas-config-schema'

// ─── Form de edicion inline ───────────────────────────────────

interface EditRowProps {
  configId: string
  clave: string
  cuentaActualId: string
  onDone: () => void
}

function EditRow({ clave, cuentaActualId, onDone }: EditRowProps) {
  const { user } = useCurrentUser()
  const { cuentas } = useCuentasDetalle()
  const [cuentaId, setCuentaId] = useState(cuentaActualId)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!cuentaId || !user?.empresa_id) return
    setSaving(true)
    try {
      await actualizarCuentaConfig(clave, cuentaId, user.empresa_id, user.id)
      toast.success('Cuenta actualizada')
      onDone()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={cuentaId}
        onChange={(e) => setCuentaId(e.target.value)}
        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Seleccionar cuenta...</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} - {c.nombre}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving || !cuentaId}
        className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? '...' : 'Guardar'}
      </button>
      <button
        onClick={onDone}
        disabled={saving}
        className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function CuentasConfigList() {
  const { configs, isLoading } = useCuentasConfig()
  const [editingClave, setEditingClave] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  // Agrupar por modulo segun prefijo de clave
  const grupos: Record<string, typeof configs> = {
    'Caja y Bancos': configs.filter((c) => ['CAJA_EFECTIVO', 'CAJA_CHICA', 'BANCO_DEFAULT'].includes(c.clave)),
    'Clientes e Inventario': configs.filter((c) => ['CXC_CLIENTES', 'INVENTARIO'].includes(c.clave)),
    'Impuestos y Retenciones': configs.filter((c) =>
      ['IVA_CREDITO', 'IVA_DEBITO', 'RET_IVA_SOPORTADA', 'RET_ISLR_SOPORTADA',
       'RET_IVA_POR_ENTERAR', 'RET_ISLR_POR_ENTERAR', 'IGTF_POR_PAGAR'].includes(c.clave)
    ),
    'Proveedores': configs.filter((c) => ['CXP_PROVEEDORES'].includes(c.clave)),
    'Ingresos y Costos': configs.filter((c) =>
      ['INGRESO_VENTA_PRODUCTO', 'INGRESO_VENTA_SERVICIO', 'DESCUENTO_VENTAS',
       'DEVOLUCION_VENTAS', 'COSTO_VENTA'].includes(c.clave)
    ),
  }

  return (
    <div className="space-y-6">
      {Object.entries(grupos).map(([grupo, items]) => (
        <div key={grupo}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{grupo}</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-700 w-1/3">Clave</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700 w-1/3">Cuenta Asignada</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-700 w-1/3">Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-gray-400 text-xs">
                      Sin configurar
                    </td>
                  </tr>
                ) : (
                  items.map((cfg) => (
                    <tr key={cfg.clave} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-xs">{cfg.clave}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{CLAVES_CONFIG[cfg.clave] ?? cfg.descripcion}</div>
                      </td>
                      <td className="px-4 py-3">
                        {editingClave === cfg.clave ? (
                          <EditRow
                            configId={cfg.id}
                            clave={cfg.clave}
                            cuentaActualId={cfg.cuenta_contable_id}
                            onDone={() => setEditingClave(null)}
                          />
                        ) : (
                          <span className="font-mono text-xs text-gray-700">
                            {cfg.cuenta_codigo} - {cfg.cuenta_nombre}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingClave !== cfg.clave && (
                          <button
                            onClick={() => setEditingClave(cfg.clave)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                          >
                            <Pencil className="h-3 w-3" />
                            Cambiar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {configs.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No hay configuraciones de cuentas.</p>
          <p className="text-xs mt-1">Ejecuta la migracion SQL para generar el seed inicial.</p>
        </div>
      )}
    </div>
  )
}
