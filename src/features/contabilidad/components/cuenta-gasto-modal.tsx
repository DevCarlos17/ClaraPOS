import { useRef, useState } from 'react'
import { X, Plus, Trash2, Pencil, Check, FolderTree, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGruposGastoConSubcuentas,
  useCuentaIdsConGastos,
  actualizarCuenta,
  crearGrupoGastoConSubcuentas,
  agregarSubcuentaAGrupo,
  eliminarSubcuentaGasto,
  eliminarGrupoGastoCompleto,
  type CuentaContable,
  type GrupoConSubcuentas,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Props ────────────────────────────────────────────────────

interface CuentaGastoModalProps {
  isOpen: boolean
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────

type Tab = 'gestionar' | 'crear'

function nuevaSubRow() {
  return { id: uuidv4(), nombre: '' }
}

// ─── Componente principal ─────────────────────────────────────

export function CuentaGastoModal({ isOpen, onClose }: CuentaGastoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { grupos, isLoading } = useGruposGastoConSubcuentas()
  const cuentasConGastos = useCuentaIdsConGastos()

  // ─── Tab activo ───────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('gestionar')

  // ─── Estado edicion inline ────────────────────────────────
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditando, setNombreEditando] = useState('')
  const [guardando, setGuardando] = useState(false)

  // ─── Estado agregar subcuenta a grupo existente ───────────
  const [agregandoEnGrupoId, setAgregandoEnGrupoId] = useState<string | null>(null)
  const [nuevaSubNombre, setNuevaSubNombre] = useState('')
  const [agregando, setAgregando] = useState(false)

  // ─── Estado confirmacion / eliminar ───────────────────────
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  // ─── Estado crear nuevo grupo ─────────────────────────────
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('')
  const [nuevasSubs, setNuevasSubs] = useState<{ id: string; nombre: string }[]>([nuevaSubRow()])
  const [creando, setCreando] = useState(false)
  const [errGrupo, setErrGrupo] = useState('')

  // ─── Abrir / cerrar ───────────────────────────────────────

  if (isOpen && dialogRef.current && !dialogRef.current.open) {
    dialogRef.current.showModal()
  }
  if (!isOpen && dialogRef.current?.open) {
    dialogRef.current.close()
  }

  function handleClose() {
    setTab('gestionar')
    setEditandoId(null)
    setNombreEditando('')
    setAgregandoEnGrupoId(null)
    setNuevaSubNombre('')
    setConfirmandoEliminarId(null)
    setNuevoGrupoNombre('')
    setNuevasSubs([nuevaSubRow()])
    setErrGrupo('')
    onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) handleClose()
  }

  // ─── Editar nombre ────────────────────────────────────────

  function iniciarEdicion(cuenta: CuentaContable) {
    setConfirmandoEliminarId(null)
    setAgregandoEnGrupoId(null)
    setEditandoId(cuenta.id)
    setNombreEditando(cuenta.nombre)
  }

  async function guardarEdicion() {
    if (!editandoId || !nombreEditando.trim() || !user) return
    setGuardando(true)
    try {
      await actualizarCuenta(editandoId, { nombre: nombreEditando.trim(), updated_by: user.id })
      toast.success('Nombre actualizado')
      setEditandoId(null)
    } catch {
      toast.error('Error al actualizar el nombre')
    } finally {
      setGuardando(false)
    }
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setNombreEditando('')
  }

  // ─── Eliminar subcuenta ───────────────────────────────────

  async function handleEliminarSubcuenta(subcuentaId: string) {
    if (!user?.empresa_id) return
    setEliminandoId(subcuentaId)
    try {
      await eliminarSubcuentaGasto(subcuentaId, user.empresa_id)
      toast.success('Subcuenta eliminada')
      setConfirmandoEliminarId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setEliminandoId(null)
    }
  }

  // ─── Eliminar grupo completo ──────────────────────────────

  async function handleEliminarGrupo(grupoId: string) {
    if (!user?.empresa_id) return
    setEliminandoId(grupoId)
    try {
      await eliminarGrupoGastoCompleto(grupoId, user.empresa_id)
      toast.success('Grupo eliminado')
      setConfirmandoEliminarId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setEliminandoId(null)
    }
  }

  // ─── Agregar subcuenta a grupo existente ─────────────────

  async function handleAgregarSubcuenta(grupo: GrupoConSubcuentas) {
    if (!nuevaSubNombre.trim() || !user?.empresa_id) return
    setAgregando(true)
    try {
      await agregarSubcuentaAGrupo({
        grupoId: grupo.id,
        grupoCodigo: grupo.codigo,
        grupoNivel: grupo.nivel,
        nombreSubcuenta: nuevaSubNombre,
        empresaId: user.empresa_id,
        userId: user.id,
      })
      toast.success('Subcuenta agregada')
      setAgregandoEnGrupoId(null)
      setNuevaSubNombre('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar subcuenta')
    } finally {
      setAgregando(false)
    }
  }

  // ─── Crear nuevo grupo ────────────────────────────────────

  async function handleCrearGrupo(e: React.FormEvent) {
    e.preventDefault()
    setErrGrupo('')

    if (!nuevoGrupoNombre.trim()) {
      setErrGrupo('El nombre del grupo es requerido')
      return
    }
    const subsValidas = nuevasSubs.filter((s) => s.nombre.trim())
    if (subsValidas.length === 0) {
      setErrGrupo('Debe agregar al menos una subcuenta con nombre')
      return
    }
    if (!user?.empresa_id) return

    setCreando(true)
    try {
      await crearGrupoGastoConSubcuentas({
        nombreGrupo: nuevoGrupoNombre,
        subcuentas: subsValidas.map((s) => s.nombre),
        empresaId: user.empresa_id,
        userId: user.id,
      })
      toast.success(
        `Grupo "${nuevoGrupoNombre.trim().toUpperCase()}" creado con ${subsValidas.length} subcuenta(s)`
      )
      setNuevoGrupoNombre('')
      setNuevasSubs([nuevaSubRow()])
      setTab('gestionar')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el grupo')
    } finally {
      setCreando(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-xl shadow-xl"
    >
      <div className="flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Cuentas de Gasto</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 shrink-0">
          <button
            type="button"
            onClick={() => setTab('gestionar')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'gestionar'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Gestionar
            {grupos.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-medium bg-muted text-muted-foreground rounded-full w-4 h-4">
                {grupos.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('crear')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'crear'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Nuevo Grupo
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── TAB: GESTIONAR ──────────────────────────────── */}
          {tab === 'gestionar' && (
            <div className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-lg border border-border overflow-hidden">
                      <div className="h-10 bg-muted/50 animate-pulse" />
                      <div className="h-8 bg-muted/30 animate-pulse border-t border-border/50" />
                    </div>
                  ))}
                </div>
              ) : grupos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Sin cuentas de gasto</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">
                    Crea tu primer grupo en la pestaña &quot;Nuevo Grupo&quot;
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {grupos.map((grupo) => {
                    const grupoTieneGastos = grupo.subcuentas.some((s) => cuentasConGastos.has(s.id))
                    const confirmandoGrupo = confirmandoEliminarId === grupo.id
                    const esEliminandoGrupo = eliminandoId === grupo.id

                    return (
                      <div key={grupo.id} className="rounded-lg border border-border overflow-hidden">

                        {/* Fila del grupo */}
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
                          <span className="text-[11px] font-mono text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded shrink-0">
                            {grupo.codigo}
                          </span>

                          {editandoId === grupo.id ? (
                            /* Modo edicion grupo */
                            <>
                              <input
                                type="text"
                                value={nombreEditando}
                                onChange={(e) => setNombreEditando(e.target.value.toUpperCase())}
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') cancelarEdicion() }}
                                className="flex-1 rounded border border-input px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                type="button"
                                onClick={guardarEdicion}
                                disabled={guardando}
                                className="p-1 text-primary hover:text-primary/80 disabled:opacity-50"
                                title="Guardar"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicion}
                                className="p-1 text-muted-foreground hover:text-foreground"
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : confirmandoGrupo ? (
                            /* Confirmacion eliminar grupo */
                            <>
                              <span className="flex-1 text-sm font-semibold text-foreground truncate">
                                {grupo.nombre}
                              </span>
                              <span className="text-xs text-destructive shrink-0">¿Eliminar grupo y subcuentas?</span>
                              <button
                                type="button"
                                onClick={() => handleEliminarGrupo(grupo.id)}
                                disabled={esEliminandoGrupo}
                                className="text-xs px-2 py-1 bg-destructive text-white rounded disabled:opacity-50 shrink-0"
                              >
                                {esEliminandoGrupo ? '...' : 'Confirmar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmandoEliminarId(null)}
                                className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded shrink-0"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            /* Vista normal grupo */
                            <>
                              <span className="flex-1 text-sm font-semibold text-foreground truncate">
                                {grupo.nombre}
                              </span>
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(grupo)}
                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                title="Editar nombre"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {!grupoTieneGastos && (
                                <button
                                  type="button"
                                  onClick={() => { setConfirmandoEliminarId(grupo.id); setEditandoId(null) }}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Eliminar grupo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Subcuentas */}
                        <div className="divide-y divide-border/40">
                          {grupo.subcuentas.map((sub) => {
                            const subTieneGastos = cuentasConGastos.has(sub.id)
                            const confirmandoSub = confirmandoEliminarId === sub.id
                            const esEliminandoSub = eliminandoId === sub.id

                            return (
                              <div key={sub.id} className="flex items-center gap-2 px-3 py-2 pl-5">
                                <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                                  {sub.codigo}
                                </span>

                                {editandoId === sub.id ? (
                                  /* Modo edicion subcuenta */
                                  <>
                                    <input
                                      type="text"
                                      value={nombreEditando}
                                      onChange={(e) => setNombreEditando(e.target.value.toUpperCase())}
                                      autoFocus
                                      onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') cancelarEdicion() }}
                                      className="flex-1 rounded border border-input px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button
                                      type="button"
                                      onClick={guardarEdicion}
                                      disabled={guardando}
                                      className="p-1 text-primary hover:text-primary/80 disabled:opacity-50"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelarEdicion}
                                      className="p-1 text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : confirmandoSub ? (
                                  /* Confirmacion eliminar subcuenta */
                                  <>
                                    <span className="flex-1 text-sm text-foreground truncate">{sub.nombre}</span>
                                    <span className="text-xs text-destructive shrink-0">¿Eliminar?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleEliminarSubcuenta(sub.id)}
                                      disabled={esEliminandoSub}
                                      className="text-xs px-2 py-0.5 bg-destructive text-white rounded disabled:opacity-50 shrink-0"
                                    >
                                      {esEliminandoSub ? '...' : 'Si'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmandoEliminarId(null)}
                                      className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded shrink-0"
                                    >
                                      No
                                    </button>
                                  </>
                                ) : (
                                  /* Vista normal subcuenta */
                                  <>
                                    <span className="flex-1 text-sm text-foreground truncate">{sub.nombre}</span>
                                    {subTieneGastos && (
                                      <span className="text-[10px] text-muted-foreground/50 shrink-0 italic">
                                        con registros
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => iniciarEdicion(sub)}
                                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                      title="Editar nombre"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    {!subTieneGastos && (
                                      <button
                                        type="button"
                                        onClick={() => { setConfirmandoEliminarId(sub.id); setEditandoId(null) }}
                                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Eliminar subcuenta"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          })}

                          {/* Fila para agregar subcuenta */}
                          {agregandoEnGrupoId === grupo.id ? (
                            <div className="flex items-center gap-2 px-3 py-2 pl-5 bg-muted/20">
                              <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                              <input
                                type="text"
                                value={nuevaSubNombre}
                                onChange={(e) => setNuevaSubNombre(e.target.value.toUpperCase())}
                                placeholder="Nombre de la nueva subcuenta"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleAgregarSubcuenta(grupo) }
                                  if (e.key === 'Escape') { setAgregandoEnGrupoId(null); setNuevaSubNombre('') }
                                }}
                                className="flex-1 rounded border border-input px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                type="button"
                                onClick={() => handleAgregarSubcuenta(grupo)}
                                disabled={agregando || !nuevaSubNombre.trim()}
                                className="p-1 text-primary hover:text-primary/80 disabled:opacity-40"
                                title="Agregar"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAgregandoEnGrupoId(null); setNuevaSubNombre('') }}
                                className="p-1 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="px-3 py-1.5 pl-8">
                              <button
                                type="button"
                                onClick={() => {
                                  setAgregandoEnGrupoId(grupo.id)
                                  setNuevaSubNombre('')
                                  setEditandoId(null)
                                  setConfirmandoEliminarId(null)
                                }}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                                Agregar subcuenta
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: NUEVO GRUPO ────────────────────────────── */}
          {tab === 'crear' && (
            <div className="p-5">
              <p className="text-xs text-muted-foreground mb-5">
                El sistema asignara automaticamente el codigo contable al grupo y sus subcuentas.
                Las subcuentas son las que aparecen al registrar un gasto.
              </p>

              <form onSubmit={handleCrearGrupo} className="space-y-5">
                {/* Nombre del grupo */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Nombre del Grupo
                  </label>
                  <input
                    type="text"
                    value={nuevoGrupoNombre}
                    onChange={(e) => setNuevoGrupoNombre(e.target.value.toUpperCase())}
                    placeholder="Ej: GASTOS ADMINISTRATIVOS"
                    className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                      errGrupo && !nuevoGrupoNombre.trim() ? 'border-destructive' : 'border-input'
                    }`}
                  />
                </div>

                {/* Subcuentas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-foreground">
                      Subcuentas de Movimiento
                    </label>
                    <button
                      type="button"
                      onClick={() => setNuevasSubs((prev) => [...prev, nuevaSubRow()])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar
                    </button>
                  </div>

                  <div className="space-y-2">
                    {nuevasSubs.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sub.nombre}
                          onChange={(e) =>
                            setNuevasSubs((prev) =>
                              prev.map((s) =>
                                s.id === sub.id ? { ...s, nombre: e.target.value.toUpperCase() } : s
                              )
                            )
                          }
                          placeholder={`Subcuenta ${idx + 1}`}
                          className="flex-1 rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {nuevasSubs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setNuevasSubs((prev) => prev.filter((s) => s.id !== sub.id))}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">
                    Los codigos se asignan automaticamente al guardar.
                  </p>
                </div>

                {errGrupo && <p className="text-destructive text-xs">{errGrupo}</p>}

                <div className="flex justify-end gap-3 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={creando}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creando}
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {creando ? 'Creando...' : 'Crear Grupo'}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </dialog>
  )
}
