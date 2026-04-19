import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cuentaSchema, TIPOS_CUENTA, NATURALEZAS_CUENTA, NATURALEZA_POR_TIPO } from '@/features/contabilidad/schemas/cuenta-schema'
import type { TipoCuenta, NaturalezaCuenta } from '@/features/contabilidad/schemas/cuenta-schema'
import {
  crearCuenta,
  actualizarCuenta,
  type CuentaContable,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Props ────────────────────────────────────────────────────

interface CuentaFormProps {
  isOpen: boolean
  onClose: () => void
  cuenta?: CuentaContable
  cuentas: CuentaContable[]
  /** Cuando se provee, el formulario pre-rellena campos para crear una subcuenta */
  parentPreset?: CuentaContable
}

const TIPO_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  COSTO: 'Costo',
  GASTO: 'Gasto',
}

// ─── Componente ───────────────────────────────────────────────

export function CuentaForm({ isOpen, onClose, cuenta, cuentas, parentPreset }: CuentaFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const isEditing = !!cuenta

  // ─── Estado de campos ──────────────────────────────────────

  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('GASTO')
  const [naturaleza, setNaturaleza] = useState<NaturalezaCuenta>('DEUDORA')
  const [parentId, setParentId] = useState('')
  const [nivel, setNivel] = useState('1')
  const [esCuentaDetalle, setEsCuentaDetalle] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Solo cuentas de grupo (no detalle) pueden ser padre
  const cuentasGrupo = cuentas.filter((c) => c.es_cuenta_detalle === 0)

  // ─── Abrir / cerrar dialogo ───────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (cuenta) {
        // Modo edicion: cargar datos existentes
        setCodigo(cuenta.codigo)
        setNombre(cuenta.nombre)
        setTipo(cuenta.tipo as TipoCuenta)
        setNaturaleza((cuenta.naturaleza as NaturalezaCuenta) ?? 'DEUDORA')
        setParentId(cuenta.parent_id ?? '')
        setNivel(String(cuenta.nivel))
        setEsCuentaDetalle(cuenta.es_cuenta_detalle === 1)
        setIsActive(cuenta.is_active === 1)
      } else if (parentPreset) {
        // Modo nueva subcuenta: pre-rellenar a partir del padre
        setCodigo(parentPreset.codigo + '.')
        setNombre('')
        setTipo(parentPreset.tipo as TipoCuenta)
        setNaturaleza((parentPreset.naturaleza as NaturalezaCuenta) ?? 'DEUDORA')
        setParentId(parentPreset.id)
        setNivel(String(parentPreset.nivel + 1))
        setEsCuentaDetalle(false)
        setIsActive(true)
      } else {
        // Modo nueva cuenta raiz
        setCodigo('')
        setNombre('')
        setTipo('GASTO')
        setNaturaleza('DEUDORA')
        setParentId('')
        setNivel('1')
        setEsCuentaDetalle(false)
        setIsActive(true)
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, cuenta, parentPreset])

  // Auto-completar naturaleza cuando cambia el tipo
  function handleTipoChange(nuevoTipo: TipoCuenta) {
    setTipo(nuevoTipo)
    setNaturaleza(NATURALEZA_POR_TIPO[nuevoTipo])
  }

  // ─── Submit ───────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = cuentaSchema.safeParse({
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      tipo,
      naturaleza,
      parent_id: parentId || undefined,
      nivel: parseInt(nivel, 10) || 0,
      es_cuenta_detalle: esCuentaDetalle,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && cuenta) {
        await actualizarCuenta(cuenta.id, {
          nombre: parsed.data.nombre,
          tipo: parsed.data.tipo,
          naturaleza: parsed.data.naturaleza,
          parent_id: parsed.data.parent_id ?? null,
          nivel: parsed.data.nivel,
          es_cuenta_detalle: parsed.data.es_cuenta_detalle,
          is_active: isActive,
          updated_by: user.id,
        })
        toast.success('Cuenta actualizada correctamente')
      } else {
        await crearCuenta({
          codigo: parsed.data.codigo,
          nombre: parsed.data.nombre,
          tipo: parsed.data.tipo,
          naturaleza: parsed.data.naturaleza,
          parent_id: parsed.data.parent_id,
          nivel: parsed.data.nivel,
          es_cuenta_detalle: parsed.data.es_cuenta_detalle,
          empresa_id: user.empresa_id!,
          created_by: user.id,
        })
        toast.success('Cuenta creada correctamente')
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing
            ? 'Editar Cuenta'
            : parentPreset
              ? `Nueva Subcuenta de ${parentPreset.nombre}`
              : 'Nueva Cuenta Contable'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Codigo */}
          <div>
            <label htmlFor="cuenta-codigo" className="block text-sm font-medium text-gray-700 mb-1">
              Codigo
            </label>
            <input
              id="cuenta-codigo"
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Ej: 6.1.01"
              readOnly={isEditing}
              disabled={isEditing}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.codigo ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.codigo && (
              <p className="text-red-500 text-xs mt-1">{errors.codigo}</p>
            )}
            {isEditing && (
              <p className="text-gray-400 text-xs mt-1">No se puede modificar el codigo</p>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label htmlFor="cuenta-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="cuenta-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: GASTOS DE PERSONAL"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label htmlFor="cuenta-tipo" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <select
              id="cuenta-tipo"
              value={tipo}
              onChange={(e) => handleTipoChange(e.target.value as TipoCuenta)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.tipo ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              {TIPOS_CUENTA.map((t) => (
                <option key={t} value={t}>{TIPO_LABELS[t]}</option>
              ))}
            </select>
            {errors.tipo && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>
            )}
          </div>

          {/* Naturaleza */}
          <div>
            <label htmlFor="cuenta-naturaleza" className="block text-sm font-medium text-gray-700 mb-1">
              Naturaleza
            </label>
            <select
              id="cuenta-naturaleza"
              value={naturaleza}
              onChange={(e) => setNaturaleza(e.target.value as NaturalezaCuenta)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.naturaleza ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              {NATURALEZAS_CUENTA.map((n) => (
                <option key={n} value={n}>{n === 'DEUDORA' ? 'Deudora (aumenta con DEBE)' : 'Acreedora (aumenta con HABER)'}</option>
              ))}
            </select>
            {errors.naturaleza && (
              <p className="text-red-500 text-xs mt-1">{errors.naturaleza}</p>
            )}
          </div>

          {/* Cuenta padre */}
          <div>
            <label htmlFor="cuenta-parent" className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta Padre <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              id="cuenta-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sin padre</option>
              {cuentasGrupo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Nivel */}
          <div>
            <label htmlFor="cuenta-nivel" className="block text-sm font-medium text-gray-700 mb-1">
              Nivel
            </label>
            <input
              id="cuenta-nivel"
              type="number"
              min="1"
              step="1"
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              placeholder="1"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nivel ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nivel && (
              <p className="text-red-500 text-xs mt-1">{errors.nivel}</p>
            )}
          </div>

          {/* Es cuenta detalle */}
          <div className="flex items-center gap-2">
            <input
              id="cuenta-detalle"
              type="checkbox"
              checked={esCuentaDetalle}
              onChange={(e) => setEsCuentaDetalle(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="cuenta-detalle" className="text-sm font-medium text-gray-700">
              Es cuenta de detalle
            </label>
          </div>

          {/* Activo (solo en edicion) */}
          {isEditing && (
            <div className="flex items-center gap-2">
              <input
                id="cuenta-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="cuenta-active" className="text-sm font-medium text-gray-700">
                Activa
              </label>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
