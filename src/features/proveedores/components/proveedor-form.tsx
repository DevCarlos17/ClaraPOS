import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { proveedorSchema } from '@/features/proveedores/schemas/proveedor-schema'
import {
  crearProveedor,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface ProveedorFormProps {
  isOpen: boolean
  onClose: () => void
  proveedor?: Proveedor
}

const TIPOS_CONTRIBUYENTE = [
  { value: '', label: 'Sin clasificar' },
  { value: 'Ordinario', label: 'Ordinario' },
  { value: 'Especial', label: 'Especial' },
  { value: 'Formal', label: 'Formal' },
] as const

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
    hasError ? 'border-red-500' : 'border-input'
  }`

export function ProveedorForm({ isOpen, onClose, proveedor }: ProveedorFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
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

  // --- Datos fiscales ---
  const [tipoContribuyente, setTipoContribuyente] = useState('')
  const [retieneIva, setRetieneIva] = useState(false)
  const [retieneIslr, setRetieneIslr] = useState(false)
  const [retencionIvaPct, setRetencionIvaPct] = useState('')

  // --- Credito ---
  const [diasCredito, setDiasCredito] = useState('0')
  const [limiteCreditoUsd, setLimiteCreditoUsd] = useState('0')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

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
        setTipoContribuyente(proveedor.tipo_contribuyente ?? '')
        setRetieneIva(proveedor.retiene_iva === 1)
        setRetieneIslr(proveedor.retiene_islr === 1)
        setRetencionIvaPct(proveedor.retencion_iva_pct ?? '')
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
        setTipoContribuyente('')
        setRetieneIva(false)
        setRetieneIslr(false)
        setRetencionIvaPct('')
        setDiasCredito('0')
        setLimiteCreditoUsd('0')
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, proveedor])

  // Clear retencion_iva_pct when unchecking retiene_iva
  useEffect(() => {
    if (!retieneIva) setRetencionIvaPct('')
  }, [retieneIva])

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
      tipo_contribuyente: tipoContribuyente || undefined,
      retiene_iva: retieneIva,
      retiene_islr: retieneIslr,
      retencion_iva_pct: retencionIvaPct !== '' ? Number(retencionIvaPct) : null,
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
          tipo_contribuyente: parsed.data.tipo_contribuyente,
          retiene_iva: parsed.data.retiene_iva,
          retiene_islr: parsed.data.retiene_islr,
          retencion_iva_pct: parsed.data.retencion_iva_pct ?? null,
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
          tipo_contribuyente: parsed.data.tipo_contribuyente,
          retiene_iva: parsed.data.retiene_iva,
          retiene_islr: parsed.data.retiene_islr,
          retencion_iva_pct: parsed.data.retencion_iva_pct ?? undefined,
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

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">
          {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        </h2>

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
              onChange={(e) => setRif(e.target.value.toUpperCase())}
              disabled={isEditing}
              placeholder="J-00000000-0"
              maxLength={12}
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

          {/* ---- Datos Fiscales ---- */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3 border-b border-border pb-1">
              Datos Fiscales
            </p>

            <div className="mb-4">
              <label
                htmlFor="prov-tipo-contrib"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Tipo de Contribuyente
              </label>
              <select
                id="prov-tipo-contrib"
                value={tipoContribuyente}
                onChange={(e) => setTipoContribuyente(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
              >
                {TIPOS_CONTRIBUYENTE.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              {/* Retiene IVA + porcentaje condicional */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    id="prov-iva"
                    type="checkbox"
                    checked={retieneIva}
                    onChange={(e) => setRetieneIva(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <label htmlFor="prov-iva" className="text-sm font-medium text-muted-foreground">
                    Retiene IVA
                  </label>
                </div>
                {retieneIva && (
                  <div className="ml-6">
                    <label
                      htmlFor="prov-iva-pct"
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      % Retencion IVA
                    </label>
                    <div className="relative w-28">
                      <input
                        id="prov-iva-pct"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={retencionIvaPct}
                        onChange={(e) => setRetencionIvaPct(e.target.value)}
                        placeholder="75"
                        className={`w-full rounded-md border px-3 py-1.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                          errors.retencion_iva_pct ? 'border-red-500' : 'border-input'
                        }`}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                    {errors.retencion_iva_pct && (
                      <p className="text-red-500 text-xs mt-1">{errors.retencion_iva_pct}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Retiene ISLR */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  id="prov-islr"
                  type="checkbox"
                  checked={retieneIslr}
                  onChange={(e) => setRetieneIslr(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <label htmlFor="prov-islr" className="text-sm font-medium text-muted-foreground">
                  Retiene ISLR
                </label>
              </div>
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
      </div>
    </dialog>
  )
}
