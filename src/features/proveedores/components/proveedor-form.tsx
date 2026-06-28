import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash } from '@phosphor-icons/react'
import { useQuery } from '@powersync/react'
import { proveedorSchema } from '@/features/proveedores/schemas/proveedor-schema'
import { filterRifInput } from '@/lib/identity'
import {
  crearProveedor,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import {
  useBancosProveedor,
  crearBancoProveedor,
  actualizarBancoProveedor,
} from '@/features/compras/hooks/use-proveedores-bancos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ProveedorFormProps {
  isOpen: boolean
  onClose: () => void
  proveedor?: Proveedor
}

interface Moneda {
  id: string
  nombre: string
  codigo_iso: string
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
    hasError ? 'border-red-500' : 'border-input'
  }`

// ─── Sub-form: Agregar cuenta bancaria ─────────────────────

interface AgregarBancoFormProps {
  proveedorId: string
  empresaId: string
  onSaved: () => void
  onCancel: () => void
}

function AgregarBancoForm({ proveedorId, empresaId, onSaved, onCancel }: AgregarBancoFormProps) {
  const [titularDoc, setTitularDoc] = useState('')
  const [nroCuenta, setNroCuenta] = useState('')
  const [nombreBanco, setNombreBanco] = useState('')
  const [monedaId, setMonedaId] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: monedasData } = useQuery(
    'SELECT id, nombre, codigo_iso FROM monedas ORDER BY nombre ASC'
  )
  const monedas = useMemo(() => (monedasData ?? []) as Moneda[], [monedasData])

  async function handleSave() {
    if (!nombreBanco.trim() || !nroCuenta.trim()) {
      toast.error('Banco y Nro. Cuenta son obligatorios')
      return
    }
    setSaving(true)
    try {
      await crearBancoProveedor({
        proveedor_id: proveedorId,
        nombre_banco: nombreBanco.trim(),
        nro_cuenta: nroCuenta.trim(),
        titular_documento: titularDoc.trim() || undefined,
        moneda_id: monedaId || undefined,
        empresa_id: empresaId,
      })
      toast.success('Cuenta bancaria agregada')
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          RIF / Cedula del proveedor
        </label>
        <input
          type="text"
          value={titularDoc}
          onChange={(e) => setTitularDoc(e.target.value.toUpperCase())}
          placeholder="J001234567"
          className={inputClass(false)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Nro. Cuenta / Nro. Telefono
        </label>
        <input
          type="text"
          value={nroCuenta}
          onChange={(e) => setNroCuenta(e.target.value)}
          placeholder="0102-0000-00-0000000000"
          className={inputClass(false)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Banco
        </label>
        <input
          type="text"
          value={nombreBanco}
          onChange={(e) => setNombreBanco(e.target.value.toUpperCase())}
          placeholder="BANCO MERCANTIL"
          className={inputClass(false)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Moneda
        </label>
        <select
          value={monedaId}
          onChange={(e) => setMonedaId(e.target.value)}
          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
        >
          <option value="">-- Seleccionar --</option>
          {monedas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} ({m.codigo_iso})
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────

export function ProveedorForm({ isOpen, onClose, proveedor }: ProveedorFormProps) {
  const isEditing = !!proveedor
  const { user } = useCurrentUser()

  // --- Datos generales ---
  const [razonSocial, setRazonSocial] = useState('')
  const [nombreComercial, setNombreComercial] = useState('')
  const [rif, setRif] = useState('')
  const [direccionFiscal, setDireccionFiscal] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')

  // --- Credito ---
  const [diasCredito, setDiasCredito] = useState('0')
  const [limiteCreditoUsd, setLimiteCreditoUsd] = useState('0')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // --- Cuentas bancarias ---
  const [agregarBancoOpen, setAgregarBancoOpen] = useState(false)
  const { bancos, isLoading: loadingBancos } = useBancosProveedor(proveedor?.id ?? '')

  useEffect(() => {
    if (isOpen) {
      if (proveedor) {
        setRazonSocial(proveedor.razon_social)
        setNombreComercial(proveedor.nombre_comercial ?? '')
        setRif(proveedor.rif)
        setDireccionFiscal(proveedor.direccion_fiscal ?? '')
        setCiudad(proveedor.ciudad ?? '')
        setTelefono(proveedor.telefono ?? '')
        setEmail(proveedor.email ?? '')
        setDiasCredito(String(proveedor.dias_credito ?? 0))
        setLimiteCreditoUsd(proveedor.limite_credito_usd ?? '0')
      } else {
        setRazonSocial('')
        setNombreComercial('')
        setRif('')
        setDireccionFiscal('')
        setCiudad('')
        setTelefono('')
        setEmail('')
        setDiasCredito('0')
        setLimiteCreditoUsd('0')
      }
      setErrors({})
    }
  }, [isOpen, proveedor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = proveedorSchema.safeParse({
      razon_social: razonSocial,
      rif,
      nombre_comercial: nombreComercial,
      direccion_fiscal: direccionFiscal,
      ciudad,
      telefono,
      email,
      dias_credito: Number(diasCredito) || 0,
      limite_credito_usd: Number(limiteCreditoUsd) || 0,
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

    setSubmitting(true)
    try {
      if (isEditing && proveedor) {
        await actualizarProveedor(proveedor.id, {
          razon_social: parsed.data.razon_social,
          nombre_comercial: parsed.data.nombre_comercial,
          direccion_fiscal: parsed.data.direccion_fiscal,
          ciudad: parsed.data.ciudad,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
          dias_credito: parsed.data.dias_credito,
          limite_credito_usd: parsed.data.limite_credito_usd,
        })
        toast.success('Proveedor actualizado correctamente')
      } else {
        await crearProveedor({
          razon_social: parsed.data.razon_social,
          rif: parsed.data.rif,
          nombre_comercial: parsed.data.nombre_comercial,
          direccion_fiscal: parsed.data.direccion_fiscal,
          ciudad: parsed.data.ciudad,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
          retiene_iva: false,
          retiene_islr: false,
          dias_credito: parsed.data.dias_credito,
          limite_credito_usd: parsed.data.limite_credito_usd,
          empresa_id: user!.empresa_id!,
        })
        toast.success('Proveedor creado correctamente')
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEliminarBanco(id: string) {
    try {
      await actualizarBancoProveedor(id, { is_active: false })
      toast.success('Cuenta eliminada')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    }
  }

  async function handleCopiarCelda(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ---- Identificacion ---- */}
            <div>
              <label htmlFor="prov-razon" className="block text-sm font-medium text-muted-foreground mb-1">
                Razon Social *
              </label>
              <input
                id="prov-razon"
                type="text"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                placeholder="Nombre legal de la empresa"
                className={inputClass(!!errors.razon_social)}
              />
              {errors.razon_social && (
                <p className="text-red-500 text-xs mt-1">{errors.razon_social}</p>
              )}
            </div>

            <div>
              <label htmlFor="prov-comercial" className="block text-sm font-medium text-muted-foreground mb-1">
                Nombre Comercial
              </label>
              <input
                id="prov-comercial"
                type="text"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value.toUpperCase())}
                placeholder="Nombre con el que opera (opcional)"
                className={inputClass(false)}
              />
            </div>

            <div>
              <label htmlFor="prov-rif" className="block text-sm font-medium text-muted-foreground mb-1">
                RIF *
              </label>
              <input
                id="prov-rif"
                type="text"
                value={rif}
                onChange={(e) => setRif(filterRifInput(e.target.value))}
                disabled={isEditing}
                placeholder="J001234567"
                maxLength={10}
                className={`${inputClass(!!errors.rif)} ${
                  isEditing ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-white'
                }`}
              />
              {errors.rif && <p className="text-red-500 text-xs mt-1">{errors.rif}</p>}
              {isEditing && (
                <p className="text-muted-foreground text-xs mt-1">El RIF no puede modificarse</p>
              )}
            </div>

            <div>
              <label htmlFor="prov-dir" className="block text-sm font-medium text-muted-foreground mb-1">
                Direccion Fiscal
              </label>
              <textarea
                id="prov-dir"
                value={direccionFiscal}
                onChange={(e) => setDireccionFiscal(e.target.value)}
                placeholder="Direccion fiscal del proveedor"
                rows={2}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Telefono, Ciudad y Correo en grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="prov-tel" className="block text-sm font-medium text-muted-foreground mb-1">
                  Telefono
                </label>
                <input
                  id="prov-tel"
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="0212-1234567"
                  className={inputClass(false)}
                />
              </div>
              <div>
                <label htmlFor="prov-ciudad" className="block text-sm font-medium text-muted-foreground mb-1">
                  Ciudad
                </label>
                <input
                  id="prov-ciudad"
                  type="text"
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value.toUpperCase())}
                  placeholder="Caracas"
                  className={inputClass(false)}
                />
              </div>
              <div>
                <label
                  htmlFor="prov-correo"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Correo Electronico
                </label>
                <input
                  id="prov-correo"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  className={inputClass(!!errors.email)}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>

            {/* ---- Credito ---- */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3 border-b border-border pb-1">
                Credito
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="prov-dias"
                    className="block text-sm font-medium text-muted-foreground mb-1"
                  >
                    Dias de Credito
                  </label>
                  <input
                    id="prov-dias"
                    type="number"
                    min={0}
                    step={1}
                    value={diasCredito}
                    onChange={(e) => setDiasCredito(e.target.value)}
                    placeholder="0"
                    className={inputClass(!!errors.dias_credito)}
                  />
                  {errors.dias_credito && (
                    <p className="text-red-500 text-xs mt-1">{errors.dias_credito}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="prov-limite"
                    className="block text-sm font-medium text-muted-foreground mb-1"
                  >
                    Limite de Credito (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <input
                      id="prov-limite"
                      type="number"
                      min={0}
                      step={0.01}
                      value={limiteCreditoUsd}
                      onChange={(e) => setLimiteCreditoUsd(e.target.value)}
                      placeholder="0.00"
                      className={`${inputClass(!!errors.limite_credito_usd)} pl-7`}
                    />
                  </div>
                  {errors.limite_credito_usd && (
                    <p className="text-red-500 text-xs mt-1">{errors.limite_credito_usd}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ---- Cuentas Bancarias (solo al editar) ---- */}
            {isEditing && proveedor && (
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-border pb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Cuentas Bancarias
                  </p>
                  <button
                    type="button"
                    onClick={() => setAgregarBancoOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar cuenta
                  </button>
                </div>

                {loadingBancos ? (
                  <div className="space-y-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-8 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : bancos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay cuentas bancarias registradas
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Titular</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Banco</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nro. Cuenta</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Moneda</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {bancos.map((banco) => (
                          <tr key={banco.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td
                              className="px-3 py-2 cursor-pointer hover:text-primary transition-colors"
                              title="Clic para copiar"
                              onClick={() => handleCopiarCelda(
                                [banco.titular, banco.titular_documento].filter(Boolean).join(' — ')
                              )}
                            >
                              <div className="font-medium">{banco.titular ?? '—'}</div>
                              {banco.titular_documento && (
                                <div className="text-muted-foreground">{banco.titular_documento}</div>
                              )}
                            </td>
                            <td
                              className="px-3 py-2 cursor-pointer hover:text-primary transition-colors"
                              title="Clic para copiar"
                              onClick={() => handleCopiarCelda(banco.nombre_banco)}
                            >
                              {banco.nombre_banco}
                            </td>
                            <td
                              className="px-3 py-2 font-mono cursor-pointer hover:text-primary transition-colors"
                              title="Clic para copiar"
                              onClick={() => handleCopiarCelda(banco.nro_cuenta)}
                            >
                              {banco.nro_cuenta}
                            </td>
                            <td
                              className="px-3 py-2 cursor-pointer hover:text-primary transition-colors"
                              title="Clic para copiar"
                              onClick={() => handleCopiarCelda(banco.moneda_id ?? '')}
                            >
                              {banco.moneda_id ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleEliminarBanco(banco.id)}
                                className="p-1 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                                title="Eliminar cuenta"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ---- Acciones ---- */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog interno: agregar cuenta bancaria */}
      <Dialog open={agregarBancoOpen} onOpenChange={(v) => !v && setAgregarBancoOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Cuenta Bancaria</DialogTitle>
          </DialogHeader>
          <AgregarBancoForm
            proveedorId={proveedor?.id ?? ''}
            empresaId={user?.empresa_id ?? ''}
            onSaved={() => setAgregarBancoOpen(false)}
            onCancel={() => setAgregarBancoOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
