import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompany, updateCompany, parseEmpresaConfig } from '../hooks/use-company'
import { companySchema } from '../schemas/company-schema'

const MONEDA_PRESENTACION_OPTIONS: { value: 'USD' | 'BS'; label: string }[] = [
  { value: 'USD', label: 'Dolares (USD)' },
  { value: 'BS', label: 'Bolivares (Bs)' },
]

export function CompanyDataForm() {
  const { company, isLoading } = useCompany()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [nombre, setNombre] = useState('')
  const [rif, setRif] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  // Lazy initializer (no separate useEffect transition): el formulario solo se
  // pinta cuando `company` ya esta disponible (gate `isLoading` mas abajo), asi
  // que el valor correcto se fija en el PRIMER render. Esto evita una transicion
  // 'USD' -> valor real que dispara un bug conocido de Radix Select (su <select>
  // nativo oculto de sincronizacion de formulario resetea el valor a "" si la
  // transicion ocurre antes de que sus <option> terminen de registrarse).
  const [monedaPresentacion, setMonedaPresentacion] = useState<'USD' | 'BS'>(
    () => parseEmpresaConfig(company?.config).moneda_presentacion_documentos ?? 'USD'
  )

  useEffect(() => {
    if (!company) return
    setNombre(company.nombre ?? '')
    setRif(company.rif ?? '')
    setDireccion(company.direccion ?? '')
    setTelefono(company.telefono ?? '')
    setEmail(company.email ?? '')
    setMonedaPresentacion(parseEmpresaConfig(company.config).moneda_presentacion_documentos ?? 'USD')
  }, [company])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return

    const result = companySchema.safeParse({ nombre, rif, direccion, telefono, email })
    if (!result.success) {
      toast.error(result.error.issues[0].message)
      return
    }

    setIsSubmitting(true)
    try {
      await updateCompany(company.id, {
        nombre: result.data.nombre,
        rif: result.data.rif,
        direccion: result.data.direccion,
        telefono: result.data.telefono,
        email: result.data.email,
        config: JSON.stringify({
          ...parseEmpresaConfig(company.config),
          moneda_presentacion_documentos: monedaPresentacion,
        }),
      })
      toast.success('Datos de empresa actualizados')
    } catch {
      toast.error('Error al actualizar los datos')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No se encontro informacion de la empresa
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Razon Social *</Label>
        <Input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => setNombre((v) => v.toUpperCase())}
          placeholder="Nombre de la empresa"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rif">RIF</Label>
        <Input
          id="rif"
          value={rif}
          onChange={(e) => setRif(e.target.value)}
          onBlur={() => setRif((v) => v.toUpperCase())}
          placeholder="J-12345678-9"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="direccion">Direccion</Label>
        <textarea
          id="direccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Direccion fiscal"
          disabled={isSubmitting}
          rows={2}
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="telefono">Telefono</Label>
          <Input
            id="telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="0412-1234567"
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="empresa@email.com"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="moneda-presentacion">Moneda de presentacion en documentos</Label>
        <Select
          value={monedaPresentacion}
          onValueChange={(value) => setMonedaPresentacion(value as 'USD' | 'BS')}
          disabled={isSubmitting}
        >
          <SelectTrigger id="moneda-presentacion" aria-label="Moneda de presentacion en documentos">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONEDA_PRESENTACION_OPTIONS.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !nombre.trim()}
          className="inline-flex items-center justify-center px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}
