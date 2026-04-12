import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  usePlanCuentas,
  actualizarCuenta,
  type CuentaContable,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import { CuentaForm } from './cuenta-form'

// ─── Badge de tipo ────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'GASTO') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
        GASTO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
      INGRESO OTRO
    </span>
  )
}

// ─── Badge de tipo de cuenta (detalle / grupo) ────────────────

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

// ─── Skeleton de carga ────────────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────

export function PlanCuentasList() {
  const { cuentas, isLoading } = usePlanCuentas()
  const [formOpen, setFormOpen] = useState(false)
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNueva() {
    setEditingCuenta(undefined)
    setFormOpen(true)
  }

  function handleEditar(cuenta: CuentaContable) {
    setEditingCuenta(cuenta)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingCuenta(undefined)
  }

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

  if (isLoading) {
    return <TablaSkeleton />
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Plan de Cuentas
          <span className="text-sm font-normal text-gray-500 ml-2">({cuentas.length})</span>
        </h2>
        <button
          onClick={handleNueva}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Cuenta
        </button>
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
                <th className="text-left px-4 py-3 font-medium text-gray-700">Detalle</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {/* Codigo con sangria por nivel */}
                  <td
                    className="px-4 py-3"
                    style={{ paddingLeft: `${16 + (c.nivel - 1) * 24}px` }}
                  >
                    <span
                      className={`font-mono text-gray-900 ${
                        c.es_cuenta_detalle === 0 ? 'font-bold' : 'font-normal'
                      }`}
                    >
                      {c.codigo}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-gray-900">{c.nombre}</td>

                  <td className="px-4 py-3">
                    <TipoBadge tipo={c.tipo} />
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
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
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
      />
    </div>
  )
}
