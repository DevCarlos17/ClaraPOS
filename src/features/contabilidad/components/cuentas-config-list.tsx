import { useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCuentasConfig, actualizarCuentaConfig, useBancosConCuenta } from '@/features/contabilidad/hooks/use-cuentas-config'
import { useCuentasDetalle } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { CLAVES_CONFIG } from '@/features/contabilidad/schemas/cuentas-config-schema'
import { updateBanco } from '@/features/configuracion/hooks/use-bancos'

// ─── Form de edicion inline de cuentas_config ─────────────────

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

// ─── Form de edicion cuenta contable de banco ─────────────────

interface EditBancoRowProps {
  bancoId: string
  cuentaActualId: string | null
  onDone: () => void
}

function EditBancoRow({ bancoId, cuentaActualId, onDone }: EditBancoRowProps) {
  const { cuentas } = useCuentasDetalle()
  const [cuentaId, setCuentaId] = useState(cuentaActualId ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await updateBanco(bancoId, { cuenta_contable_id: cuentaId || null })
      toast.success('Cuenta bancaria actualizada')
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
        <option value="">Sin cuenta contable</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} - {c.nombre}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving}
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

// ─── Form para agregar configuracion personalizada ────────────

interface AddConfigRowProps {
  onDone: () => void
}

function AddConfigRow({ onDone }: AddConfigRowProps) {
  const { user } = useCurrentUser()
  const { cuentas } = useCuentasDetalle()
  const [clave, setClave] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!clave.trim() || !cuentaId || !user?.empresa_id) return
    setSaving(true)
    try {
      await actualizarCuentaConfig(clave.toUpperCase().replace(/\s+/g, '_'), cuentaId, user.empresa_id, user.id)
      toast.success('Configuracion agregada')
      onDone()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="border-b border-blue-100 bg-blue-50">
      <td className="px-4 py-3">
        <div className="space-y-1">
          <input
            type="text"
            placeholder="CLAVE_CONFIG"
            value={clave}
            onChange={(e) => setClave(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Descripcion (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </td>
      <td className="px-4 py-3">
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Seleccionar cuenta...</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} - {c.nombre}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !clave.trim() || !cuentaId}
            className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '...' : 'Agregar'}
          </button>
          <button
            onClick={onDone}
            disabled={saving}
            className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Tabla generica de cuentas_config ─────────────────────────

interface ConfigTableProps {
  items: ReturnType<typeof useCuentasConfig>['configs']
  editingClave: string | null
  onEdit: (clave: string) => void
  onDone: () => void
  showAddButton?: boolean
}

function ConfigTable({ items, editingClave, onEdit, onDone, showAddButton }: ConfigTableProps) {
  const [adding, setAdding] = useState(false)

  return (
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
          {items.length === 0 && !adding ? (
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
                      onDone={onDone}
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
                      onClick={() => onEdit(cfg.clave)}
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
          {adding && <AddConfigRow onDone={() => setAdding(false)} />}
        </tbody>
      </table>
      {showAddButton && !adding && (
        <div className="border-t border-gray-200 px-4 py-2">
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Agregar configuracion
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Seccion de cuentas bancarias ─────────────────────────────

function BancosContablesSection() {
  const { bancos, isLoading } = useBancosConCuenta()
  const [editingBancoId, setEditingBancoId] = useState<string | null>(null)

  if (isLoading) return null

  return (
    <div className="mt-4">
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        Cuentas Bancarias Vinculadas
      </h4>
      {bancos.length === 0 ? (
        <p className="text-xs text-gray-400 px-1">No hay bancos con cuenta contable asignada. Vincula una cuenta al crear o editar un banco en Informacion Bancaria.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-medium text-gray-700 text-xs">Banco</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700 text-xs">Cuenta Contable</th>
                <th className="text-right px-4 py-2 font-medium text-gray-700 text-xs">Accion</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map((banco) => (
                <tr key={banco.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-gray-900">{banco.nombre_banco}</div>
                    {banco.nro_cuenta && (
                      <div className="text-xs text-gray-500 font-mono">{banco.nro_cuenta}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingBancoId === banco.id ? (
                      <EditBancoRow
                        bancoId={banco.id}
                        cuentaActualId={banco.cuenta_contable_id}
                        onDone={() => setEditingBancoId(null)}
                      />
                    ) : banco.cuenta_codigo ? (
                      <span className="font-mono text-xs text-gray-700">
                        {banco.cuenta_codigo} - {banco.cuenta_nombre}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">Sin cuenta asignada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingBancoId !== banco.id && (
                      <button
                        onClick={() => setEditingBancoId(banco.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                      >
                        <Pencil className="h-3 w-3" />
                        Cambiar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

const ALL_KNOWN_KEYS = new Set([
  'CAJA_EFECTIVO', 'CAJA_CHICA', 'BANCO_DEFAULT',
  'CXC_CLIENTES', 'INVENTARIO',
  'IVA_CREDITO', 'IVA_DEBITO', 'RET_IVA_SOPORTADA', 'RET_ISLR_SOPORTADA',
  'RET_IVA_POR_ENTERAR', 'RET_ISLR_POR_ENTERAR', 'IGTF_POR_PAGAR',
  'CXP_PROVEEDORES',
  'INGRESO_VENTA_PRODUCTO', 'INGRESO_VENTA_SERVICIO', 'DESCUENTO_VENTAS',
  'DEVOLUCION_VENTAS', 'COSTO_VENTA',
  'GANANCIA_DIFERENCIAL_CAMBIARIO', 'PERDIDA_DIFERENCIAL_CAMBIARIO',
])

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

  const grupos: Array<{ titulo: string; items: typeof configs; showAdd?: boolean; showBancos?: boolean }> = [
    {
      titulo: 'Caja y Bancos',
      items: configs.filter((c) => ['CAJA_EFECTIVO', 'CAJA_CHICA', 'BANCO_DEFAULT'].includes(c.clave)),
      showBancos: true,
    },
    {
      titulo: 'Diferencial Cambiario',
      items: configs.filter((c) => ['GANANCIA_DIFERENCIAL_CAMBIARIO', 'PERDIDA_DIFERENCIAL_CAMBIARIO'].includes(c.clave)),
    },
    {
      titulo: 'Clientes e Inventario',
      items: configs.filter((c) => ['CXC_CLIENTES', 'INVENTARIO'].includes(c.clave)),
    },
    {
      titulo: 'Impuestos y Retenciones',
      items: configs.filter((c) =>
        ['IVA_CREDITO', 'IVA_DEBITO', 'RET_IVA_SOPORTADA', 'RET_ISLR_SOPORTADA',
         'RET_IVA_POR_ENTERAR', 'RET_ISLR_POR_ENTERAR', 'IGTF_POR_PAGAR'].includes(c.clave)
      ),
    },
    {
      titulo: 'Proveedores',
      items: configs.filter((c) => ['CXP_PROVEEDORES'].includes(c.clave)),
    },
    {
      titulo: 'Ingresos y Costos',
      items: configs.filter((c) =>
        ['INGRESO_VENTA_PRODUCTO', 'INGRESO_VENTA_SERVICIO', 'DESCUENTO_VENTAS',
         'DEVOLUCION_VENTAS', 'COSTO_VENTA'].includes(c.clave)
      ),
    },
    {
      titulo: 'Configuraciones Adicionales',
      items: configs.filter((c) => !ALL_KNOWN_KEYS.has(c.clave)),
      showAdd: true,
    },
  ]

  return (
    <div className="space-y-6">
      {grupos.map(({ titulo, items, showAdd, showBancos }) => (
        <div key={titulo}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{titulo}</h3>
          <ConfigTable
            items={items}
            editingClave={editingClave}
            onEdit={setEditingClave}
            onDone={() => setEditingClave(null)}
            showAddButton={showAdd}
          />
          {showBancos && <BancosContablesSection />}
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
