import { useState, useEffect } from 'react'
import { Building2, Mail, Phone, MapPin, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useCompany, updateCompany } from '../hooks/use-company'
import { companySchema } from '../schemas/company-schema'

export function CompanyDataForm() {
  const { company, isLoading } = useCompany()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [nombre, setNombre] = useState('')
  const [rif, setRif] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [nroFiscal, setNroFiscal] = useState('')
  const [regimen, setRegimen] = useState('')

  useEffect(() => {
    if (!company) return
    setNombre(company.nombre ?? '')
    setRif(company.rif ?? '')
    setDireccion(company.direccion ?? '')
    setTelefono(company.telefono ?? '')
    setEmail(company.email ?? '')
    setNroFiscal(company.nro_fiscal ?? '')
    setRegimen(company.regimen ?? '')
  }, [company])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return

    const result = companySchema.safeParse({
      nombre,
      rif,
      direccion,
      telefono,
      email,
      nro_fiscal: nroFiscal,
      regimen,
    })

    if (!result.success) {
      const firstError = result.error.issues[0]
      toast.error(firstError.message)
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
        nro_fiscal: result.data.nro_fiscal,
        regimen: result.data.regimen,
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
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        No se encontro informacion de la empresa
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Current data card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Building2 className="w-5 h-5" />
          </div>
          <h3 className="font-semibold">Datos Actuales</h3>
        </div>

        <div className="space-y-3">
          <DataRow label="Razon Social" value={company.nombre} />
          <DataRow label="RIF" value={company.rif} />

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Contacto</p>
            <div className="space-y-2">
              <DataRowIcon icon={MapPin} value={company.direccion} placeholder="Sin direccion" />
              <DataRowIcon icon={Phone} value={company.telefono} placeholder="Sin telefono" />
              <DataRowIcon icon={Mail} value={company.email} placeholder="Sin email" />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Datos Fiscales</p>
            <div className="space-y-2">
              <DataRowIcon icon={FileText} value={company.nro_fiscal} placeholder="Sin nro. fiscal" />
              <DataRow label="Regimen" value={company.regimen} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Editar Datos</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nro_fiscal">Nro. Fiscal</Label>
              <Input
                id="nro_fiscal"
                value={nroFiscal}
                onChange={(e) => setNroFiscal(e.target.value)}
                onBlur={() => setNroFiscal((v) => v.toUpperCase())}
                placeholder="Registro fiscal"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regimen">Regimen</Label>
              <Input
                id="regimen"
                value={regimen}
                onChange={(e) => setRegimen(e.target.value)}
                onBlur={() => setRegimen((v) => v.toUpperCase())}
                placeholder="Tipo de regimen"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || !nombre.trim()}>
            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || <span className="text-muted-foreground italic">No definido</span>}</p>
    </div>
  )
}

function DataRowIcon({
  icon: Icon,
  value,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string | null
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-muted-foreground italic">{placeholder}</span>
      )}
    </div>
  )
}
