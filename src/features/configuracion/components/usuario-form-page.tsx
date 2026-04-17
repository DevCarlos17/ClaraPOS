import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  createRoleSchema,
} from '@/features/configuracion/schemas/usuario-schema'
import {
  crearEmpleado,
  actualizarEmpleado,
  setSupervisorPin,
  type Usuario,
} from '@/features/configuracion/hooks/use-usuarios'
import {
  useRoles,
  usePermisos,
  useRolPermisos,
  crearRolPersonalizado,
} from '@/features/configuracion/hooks/use-roles'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { RoleCardSelector } from './role-card-selector'
import { PermisosDisplay } from './permisos-display'

interface UsuarioFormPageProps {
  mode: 'create' | 'edit'
  usuario?: Usuario
}

export function UsuarioFormPage({ mode, usuario }: UsuarioFormPageProps) {
  const navigate = useNavigate()
  const isEditing = mode === 'edit'
  const { user: currentUser } = useCurrentUser()

  const { roles, isLoading: rolesLoading } = useRoles()
  const { permisosByModule, isLoading: permisosLoading } = usePermisos()

  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [password, setPassword] = useState('')
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '')
  const [rolId, setRolId] = useState(usuario?.rol_id ?? '')
  const [isCustomRole, setIsCustomRole] = useState(false)
  const [customRolNombre, setCustomRolNombre] = useState('')
  const [customRolDescripcion, setCustomRolDescripcion] = useState('')
  const [selectedPermisoIds, setSelectedPermisoIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // PIN de supervisor
  const [nuevoPin, setNuevoPin] = useState('')
  const [confirmarPin, setConfirmarPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSubmitting, setPinSubmitting] = useState(false)
  const [pinGuardado, setPinGuardado] = useState(false)

  const { permisos: rolPermisosList, permisosAgrupados, isLoading: rolPermisosLoading } = useRolPermisos(
    !isCustomRole ? rolId : ''
  )

  // Determinar si el rol actual permite ser supervisor (tiene ventas.anular o is_system)
  // Usamos useQuery directo porque useRoles() filtra is_system=0
  const { data: rolInfoData } = useQuery(
    rolId ? 'SELECT is_system FROM roles WHERE id = ?' : '',
    rolId ? [rolId] : []
  )
  const rolEsSistema = ((rolInfoData ?? []) as Array<{ is_system: number }>)[0]?.is_system === 1
  const rolTieneVentasAnular = rolPermisosList.some((p) => p.slug === 'ventas.anular')
  const mostrarSeccionPin = isEditing && usuario && (rolEsSistema || rolTieneVentasAnular)

  function handleSelectRole(id: string) {
    setIsCustomRole(false)
    setRolId(id)
    setErrors((prev) => {
      const next = { ...prev }
      delete next.rol_id
      return next
    })
  }

  function handleCustomToggle() {
    setIsCustomRole(!isCustomRole)
    if (!isCustomRole) {
      setRolId('')
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next.rol_id
      return next
    })
  }

  function goBack() {
    navigate({ to: '/configuracion/usuarios' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (isEditing && usuario) {
      const parsed = updateEmployeeSchema.safeParse({
        nombre,
        telefono,
        rol_id: isCustomRole ? undefined : rolId,
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

      if (password && password.length < 6) {
        setErrors({ password: 'La contrasena debe tener al menos 6 caracteres' })
        return
      }

      if (isCustomRole) {
        const rolParsed = createRoleSchema.safeParse({
          nombre: customRolNombre,
          descripcion: customRolDescripcion,
          permiso_ids: Array.from(selectedPermisoIds),
        })
        if (!rolParsed.success) {
          const fieldErrors: Record<string, string> = {}
          for (const issue of rolParsed.error.issues) {
            const field = issue.path[0]?.toString()
            if (field) fieldErrors[`custom_${field}`] = issue.message
          }
          setErrors(fieldErrors)
          return
        }
      }

      if (!isCustomRole && !rolId) {
        setErrors({ rol_id: 'Selecciona un rol' })
        return
      }

      setSubmitting(true)
      try {
        let finalRolId = rolId

        if (isCustomRole) {
          const result = await crearRolPersonalizado(
            customRolNombre,
            customRolDescripcion,
            Array.from(selectedPermisoIds)
          )
          finalRolId = result.roleId
        }

        await actualizarEmpleado(usuario.id, {
          nombre,
          telefono: telefono || undefined,
          rol_id: finalRolId,
          password: password || undefined,
        })
        toast.success('Empleado actualizado correctamente')
        goBack()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
    } else {
      // Validar datos del empleado (sin rol_id si es personalizado)
      const schemaData: Record<string, unknown> = { nombre, email, password, telefono }
      if (!isCustomRole) {
        schemaData.rol_id = rolId
      } else {
        schemaData.rol_id = 'placeholder'
      }
      const parsed = createEmployeeSchema.safeParse(schemaData)
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          const field = issue.path[0]?.toString()
          if (field) fieldErrors[field] = issue.message
        }
        setErrors(fieldErrors)
        return
      }

      if (isCustomRole) {
        const rolParsed = createRoleSchema.safeParse({
          nombre: customRolNombre,
          descripcion: customRolDescripcion,
          permiso_ids: Array.from(selectedPermisoIds),
        })
        if (!rolParsed.success) {
          const fieldErrors: Record<string, string> = {}
          for (const issue of rolParsed.error.issues) {
            const field = issue.path[0]?.toString()
            if (field) fieldErrors[`custom_${field}`] = issue.message
          }
          if (selectedPermisoIds.size === 0) {
            fieldErrors.rol_id = 'Completa los datos del rol personalizado'
          }
          setErrors(fieldErrors)
          return
        }
      }

      if (!isCustomRole && !rolId) {
        setErrors({ rol_id: 'Selecciona un rol' })
        return
      }

      setSubmitting(true)
      try {
        let finalRolId = rolId

        if (isCustomRole) {
          const result = await crearRolPersonalizado(
            customRolNombre,
            customRolDescripcion,
            Array.from(selectedPermisoIds)
          )
          finalRolId = result.roleId
        }

        await crearEmpleado(nombre, email, password, finalRolId, telefono || undefined)
        toast.success('Empleado creado correctamente')
        goBack()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
    }
  }

  const isLoadingData = rolesLoading || permisosLoading
  const showRolPermisos = !isCustomRole && rolId && !rolPermisosLoading
  const showRightColumn = showRolPermisos || isCustomRole

  async function handleGuardarPin(e: React.FormEvent) {
    e.preventDefault()
    setPinError('')

    if (!nuevoPin) {
      setPinError('Ingrese un PIN')
      return
    }
    if (!/^\d+$/.test(nuevoPin)) {
      setPinError('El PIN solo puede contener dígitos')
      return
    }
    if (nuevoPin.length < 4) {
      setPinError('El PIN debe tener al menos 4 dígitos')
      return
    }
    if (nuevoPin !== confirmarPin) {
      setPinError('Los PINs no coinciden')
      return
    }
    if (!currentUser?.empresa_id) {
      setPinError('No se pudo determinar la empresa')
      return
    }
    if (!usuario) return

    setPinSubmitting(true)
    try {
      await setSupervisorPin(nuevoPin, currentUser.empresa_id, usuario.id)
      setPinGuardado(true)
      setNuevoPin('')
      setConfirmarPin('')
      toast.success('PIN de supervisor configurado correctamente')
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Error al guardar el PIN')
    } finally {
      setPinSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a usuarios
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isEditing
            ? 'Modifica los datos y el rol del empleado'
            : 'Completa los datos para agregar un nuevo empleado'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* LEFT COLUMN - Employee info + Role selector (sticky on desktop) */}
          <div className={`lg:sticky lg:top-6 space-y-6 ${showRightColumn ? 'lg:col-span-2' : 'lg:col-span-5 max-w-lg'}`}>
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-5">
              {/* Employee fields */}
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Informacion del empleado
                </h2>
                <div className="grid gap-4 grid-cols-1">
                  <div>
                    <label
                      htmlFor="usr-nombre"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Nombre
                    </label>
                    <input
                      id="usr-nombre"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Nombre completo"
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                        errors.nombre ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.nombre && (
                      <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
                    )}
                  </div>

                  {!isEditing && (
                    <div>
                      <label
                        htmlFor="usr-email"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Correo electronico
                      </label>
                      <input
                        id="usr-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="empleado@ejemplo.com"
                        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                          errors.email ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.email && (
                        <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="usr-password"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {isEditing ? 'Nueva contrasena' : 'Contrasena'}
                      {isEditing && (
                        <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                      )}
                    </label>
                    <input
                      id="usr-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isEditing ? 'Dejar vacio para no cambiar' : 'Minimo 6 caracteres'}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.password && (
                      <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="usr-telefono"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Telefono
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    </label>
                    <input
                      id="usr-telefono"
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="0412-1234567"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Divider + Role selector */}
              <div className="border-t border-gray-100 pt-5">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Asignar rol</h2>

                {isLoadingData ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando roles...
                  </div>
                ) : (
                  <>
                    <RoleCardSelector
                      roles={roles}
                      selectedRolId={rolId}
                      onSelect={handleSelectRole}
                      isCustom={isCustomRole}
                      onCustomToggle={handleCustomToggle}
                    />
                    {errors.rol_id && (
                      <p className="text-red-500 text-xs mt-2">{errors.rol_id}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Actions - visible on desktop under the left card */}
            <div className="hidden lg:flex items-center gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting
                  ? 'Guardando...'
                  : isEditing
                    ? 'Actualizar Empleado'
                    : 'Crear Empleado'}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN - Permissions (scrollable) */}
          {showRightColumn && (
            <div className="lg:col-span-3">
              {/* Permissions for selected existing role */}
              {showRolPermisos && (
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Permisos del rol</h3>
                  <div className="max-h-[32rem] overflow-y-auto pr-1">
                    <PermisosDisplay mode="readonly" permisosAgrupados={permisosAgrupados} />
                  </div>
                </div>
              )}

              {/* Custom role form + permissions */}
              {isCustomRole && (
                <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">
                      Datos del nuevo rol
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="custom-rol-nombre"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Nombre del rol
                        </label>
                        <input
                          id="custom-rol-nombre"
                          type="text"
                          value={customRolNombre}
                          onChange={(e) => setCustomRolNombre(e.target.value)}
                          placeholder="Ej: Recepcionista"
                          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                            errors.custom_nombre ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.custom_nombre && (
                          <p className="text-red-500 text-xs mt-1">{errors.custom_nombre}</p>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="custom-rol-desc"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Descripcion
                          <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                        </label>
                        <input
                          id="custom-rol-desc"
                          type="text"
                          value={customRolDescripcion}
                          onChange={(e) => setCustomRolDescripcion(e.target.value)}
                          placeholder="Breve descripcion del rol"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">
                      Seleccionar permisos
                    </h3>
                    <p className="text-xs text-gray-400 mb-3">
                      {selectedPermisoIds.size > 0
                        ? `${selectedPermisoIds.size} seleccionados`
                        : 'Elige los permisos que tendra este rol'}
                    </p>
                    {errors.custom_permiso_ids && (
                      <p className="text-red-500 text-xs mb-2">{errors.custom_permiso_ids}</p>
                    )}
                    {permisosLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando permisos...
                      </div>
                    ) : (
                      <div className="max-h-[32rem] overflow-y-auto pr-1">
                        <PermisosDisplay
                          mode="editable"
                          permisosByModule={permisosByModule}
                          selectedIds={selectedPermisoIds}
                          onChange={setSelectedPermisoIds}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile-only bottom actions */}
        <div className="lg:hidden flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? 'Guardando...'
              : isEditing
                ? 'Actualizar Empleado'
                : 'Crear Empleado'}
          </button>
        </div>
      </form>

      {/* ── Sección PIN de Supervisor ── */}
      {mostrarSeccionPin && (
        <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-5 mt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">PIN de Supervisor de Caja</h3>
              <p className="text-xs text-gray-500">
                {usuario?.pin_supervisor_hash
                  ? 'Este usuario ya tiene un PIN configurado.'
                  : 'Este usuario aún no tiene PIN de supervisor configurado.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleGuardarPin} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {usuario?.pin_supervisor_hash ? 'Nuevo PIN' : 'PIN (4-8 dígitos)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={nuevoPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setNuevoPin(val)
                    setPinError('')
                    setPinGuardado(false)
                  }}
                  placeholder="••••••"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    pinError ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Confirmar PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={confirmarPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setConfirmarPin(val)
                    setPinError('')
                    setPinGuardado(false)
                  }}
                  placeholder="••••••"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    pinError ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
              </div>
            </div>

            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            {pinGuardado && (
              <p className="text-xs text-green-600">PIN configurado correctamente.</p>
            )}

            <button
              type="submit"
              disabled={pinSubmitting || !nuevoPin || !confirmarPin}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {pinSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pinSubmitting
                ? 'Guardando...'
                : usuario?.pin_supervisor_hash
                  ? 'Cambiar PIN'
                  : 'Configurar PIN'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
