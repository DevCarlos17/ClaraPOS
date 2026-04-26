import { useRef, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { crearCuenta } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

interface SubCuentaRow {
  id: string
  codigoSufijo: string
  nombre: string
}

interface CuentaGastoModalProps {
  isOpen: boolean
  onClose: () => void
}

function nuevaSubCuenta(): SubCuentaRow {
  return { id: uuidv4(), codigoSufijo: '', nombre: '' }
}

export function CuentaGastoModal({ isOpen, onClose }: CuentaGastoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()

  const [codigoGrupo, setCodigoGrupo] = useState('')
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [subCuentas, setSubCuentas] = useState<SubCuentaRow[]>([nuevaSubCuenta()])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (isOpen && dialogRef.current && !dialogRef.current.open) {
    dialogRef.current.showModal()
  }
  if (!isOpen && dialogRef.current?.open) {
    dialogRef.current.close()
  }

  function handleClose() {
    setCodigoGrupo('')
    setNombreGrupo('')
    setSubCuentas([nuevaSubCuenta()])
    setErrors({})
    onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) handleClose()
  }

  function agregarSubCuenta() {
    setSubCuentas((prev) => [...prev, nuevaSubCuenta()])
  }

  function eliminarSubCuenta(id: string) {
    setSubCuentas((prev) => prev.filter((s) => s.id !== id))
  }

  function actualizarSubCuenta(id: string, campo: 'codigoSufijo' | 'nombre', valor: string) {
    setSubCuentas((prev) =>
      prev.map((s) => s.id === id ? { ...s, [campo]: valor.toUpperCase() } : s)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const errs: Record<string, string> = {}
    if (!codigoGrupo.trim()) errs.codigoGrupo = 'El codigo del grupo es requerido'
    if (!nombreGrupo.trim()) errs.nombreGrupo = 'El nombre del grupo es requerido'
    if (subCuentas.length === 0) errs.subCuentas = 'Debe agregar al menos una subcuenta'

    for (const sc of subCuentas) {
      if (!sc.codigoSufijo.trim() || !sc.nombre.trim()) {
        errs.subCuentas = 'Todas las subcuentas deben tener codigo y nombre'
        break
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    if (!user?.empresa_id) {
      toast.error('No se pudo identificar la empresa')
      return
    }

    setSubmitting(true)
    try {
      // Detectar nivel desde el codigo del grupo (cantidad de puntos + 1)
      const nivelGrupo = codigoGrupo.trim().split('.').length

      // 1. Crear la cuenta de grupo
      const grupoId = await crearCuenta({
        codigo: codigoGrupo.trim().toUpperCase(),
        nombre: nombreGrupo.trim().toUpperCase(),
        tipo: 'GASTO',
        naturaleza: 'DEUDORA',
        nivel: nivelGrupo,
        es_cuenta_detalle: false,
        empresa_id: user.empresa_id,
        created_by: user.id,
      })

      // 2. Crear cada subcuenta bajo el grupo
      for (const sc of subCuentas) {
        const codigoCompleto = `${codigoGrupo.trim().toUpperCase()}.${sc.codigoSufijo.trim().toUpperCase()}`
        await crearCuenta({
          codigo: codigoCompleto,
          nombre: sc.nombre.trim().toUpperCase(),
          tipo: 'GASTO',
          naturaleza: 'DEUDORA',
          parent_id: grupoId,
          nivel: nivelGrupo + 1,
          es_cuenta_detalle: true,
          empresa_id: user.empresa_id,
          created_by: user.id,
        })
      }

      toast.success(`Cuenta de grupo "${codigoGrupo.trim().toUpperCase()}" creada con ${subCuentas.length} subcuenta(s)`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear las cuentas')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Crear Cuenta de Gasto</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Crea una cuenta de grupo y sus subcuentas de movimiento para el plan de cuentas de la empresa.
          Las subcuentas seran las que podrás seleccionar al registrar un gasto.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Cuenta de grupo */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Cuenta Grupo</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Codigo
                </label>
                <input
                  type="text"
                  value={codigoGrupo}
                  onChange={(e) => setCodigoGrupo(e.target.value.toUpperCase())}
                  placeholder="Ej: 6.3"
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                    errors.codigoGrupo ? 'border-destructive' : 'border-input'
                  }`}
                />
                {errors.codigoGrupo && (
                  <p className="text-destructive text-xs mt-1">{errors.codigoGrupo}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Nombre del Grupo
                </label>
                <input
                  type="text"
                  value={nombreGrupo}
                  onChange={(e) => setNombreGrupo(e.target.value.toUpperCase())}
                  placeholder="Ej: GASTOS ADMINISTRATIVOS"
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                    errors.nombreGrupo ? 'border-destructive' : 'border-input'
                  }`}
                />
                {errors.nombreGrupo && (
                  <p className="text-destructive text-xs mt-1">{errors.nombreGrupo}</p>
                )}
              </div>
            </div>
          </div>

          {/* Subcuentas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Subcuentas de Movimiento
              </h3>
              <button
                type="button"
                onClick={agregarSubCuenta}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </div>
            {errors.subCuentas && (
              <p className="text-destructive text-xs mb-2">{errors.subCuentas}</p>
            )}

            <div className="space-y-2">
              {subCuentas.map((sc, idx) => (
                <div key={sc.id} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {codigoGrupo || '?'}.
                    </span>
                    <input
                      type="text"
                      value={sc.codigoSufijo}
                      onChange={(e) => actualizarSubCuenta(sc.id, 'codigoSufijo', e.target.value)}
                      placeholder={`${String(idx + 1).padStart(2, '0')}`}
                      className="w-16 rounded-md border border-input px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={sc.nombre}
                      onChange={(e) => actualizarSubCuenta(sc.id, 'nombre', e.target.value)}
                      placeholder={`Nombre subcuenta ${idx + 1}`}
                      className="flex-1 rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {subCuentas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarSubCuenta(sc.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              El codigo completo sera: <span className="font-mono">{codigoGrupo || '?'}.XX</span>
            </p>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear Cuentas'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
