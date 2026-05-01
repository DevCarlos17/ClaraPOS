import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  useEffect(() => {
    if (!company) return
    setNombre(company.nombre ?? '')
    setRif(company.rif ?? '')
    setDireccion(company.direccion ?? '')
    setTelefono(company.telefono ?? '')
    setEmail(company.email ?? '')
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
