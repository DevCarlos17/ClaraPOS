import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useEmpresaFiscal, actualizarEmpresaFiscal } from '../hooks/use-empresa-fiscal'
import { NativeSelect } from '@/components/ui/native-select'

export function EmpresaFiscalForm() {
  const { fiscal, isLoading } = useEmpresaFiscal()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [tipoContribuyente, setTipoContribuyente] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState('')
  const [documentoIdentidad, setDocumentoIdentidad] = useState('')
  const [esAgenteRetencion, setEsAgenteRetencion] = useState(false)
  const [nroProvidencia, setNroProvidencia] = useState('')
  const [porcentajeRetencionIva, setPorcentajeRetencionIva] = useState('')
  const [codigoSucursalSeniat, setCodigoSucursalSeniat] = useState('')
  const [usaMaquinaFiscal, setUsaMaquinaFiscal] = useState(false)
  const [aplicaIgtf, setAplicaIgtf] = useState(false)

  useEffect(() => {
    if (!fiscal) return
    setTipoContribuyente(fiscal.tipo_contribuyente ?? '')
    setTipoDocumento(fiscal.tipo_documento ?? '')
    setDocumentoIdentidad(fiscal.documento_identidad ?? '')
    setEsAgenteRetencion(fiscal.es_agente_retencion === 1)
    setNroProvidencia(fiscal.nro_providencia ?? '')
    setPorcentajeRetencionIva(fiscal.porcentaje_retencion_iva ?? '')
    setCodigoSucursalSeniat(fiscal.codigo_sucursal_seniat ?? '')
    setUsaMaquinaFiscal(fiscal.usa_maquina_fiscal === 1)
    setAplicaIgtf(fiscal.aplica_igtf === 1)
  }, [fiscal])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fiscal) return

    const porcentaje = porcentajeRetencionIva !== '' ? parseFloat(porcentajeRetencionIva) : undefined
    if (porcentaje !== undefined && isNaN(porcentaje)) {
      toast.error('El porcentaje de retencion IVA debe ser un numero valido')
      return
    }

    setIsSubmitting(true)
    try {
      await actualizarEmpresaFiscal(fiscal.id, {
        tipo_contribuyente: tipoContribuyente || undefined,
        tipo_documento: tipoDocumento || undefined,
        documento_identidad: documentoIdentidad || undefined,
        es_agente_retencion: esAgenteRetencion,
        nro_providencia: nroProvidencia || undefined,
        porcentaje_retencion_iva: porcentaje,
        codigo_sucursal_seniat: codigoSucursalSeniat || undefined,
        usa_maquina_fiscal: usaMaquinaFiscal,
        aplica_igtf: aplicaIgtf,
      })
      toast.success('Datos fiscales actualizados correctamente')
    } catch {
      toast.error('Error al actualizar los datos fiscales')
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

  if (!fiscal) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No se encontraron datos fiscales
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="fiscal-tipo-contribuyente">Tipo Contribuyente</Label>
        <NativeSelect
          id="fiscal-tipo-contribuyente"
          value={tipoContribuyente}
          onChange={(e) => setTipoContribuyente(e.target.value)}
          disabled={isSubmitting}
        >
          <option value="">Seleccione</option>
          <option value="Ordinario">Ordinario</option>
          <option value="Especial">Especial</option>
          <option value="Formal">Formal</option>
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fiscal-tipo-doc">Tipo Documento</Label>
        <NativeSelect
          id="fiscal-tipo-doc"
          value={tipoDocumento}
          onChange={(e) => setTipoDocumento(e.target.value)}
          disabled={isSubmitting}
        >
          <option value="">Seleccione</option>
          <option value="V">V</option>
          <option value="J">J</option>
          <option value="E">E</option>
          <option value="G">G</option>
          <option value="P">P</option>
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fiscal-doc-id">Documento Identidad</Label>
        <Input
          id="fiscal-doc-id"
          value={documentoIdentidad}
          onChange={(e) => setDocumentoIdentidad(e.target.value)}
          placeholder="12345678"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fiscal-providencia">
          Nro Providencia <span className="text-muted-foreground font-normal text-xs">- Opcional</span>
        </Label>
        <Input
          id="fiscal-providencia"
          value={nroProvidencia}
          onChange={(e) => setNroProvidencia(e.target.value)}
          placeholder="Nro. de providencia administrativa"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fiscal-ret-iva">
          % Ret. IVA <span className="text-muted-foreground font-normal text-xs">- Opcional</span>
        </Label>
        <Input
          id="fiscal-ret-iva"
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={porcentajeRetencionIva}
          onChange={(e) => setPorcentajeRetencionIva(e.target.value)}
          placeholder="75.00"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fiscal-seniat">
          Codigo Sucursal SENIAT <span className="text-muted-foreground font-normal text-xs">- Opcional</span>
        </Label>
        <Input
          id="fiscal-seniat"
          value={codigoSucursalSeniat}
          onChange={(e) => setCodigoSucursalSeniat(e.target.value)}
          placeholder="Codigo de sucursal SENIAT"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-3 pt-1">
        <CheckboxField
          id="fiscal-agente"
          label="Es Agente de Retencion"
          checked={esAgenteRetencion}
          onChange={setEsAgenteRetencion}
          disabled={isSubmitting}
        />
        <CheckboxField
          id="fiscal-maquina"
          label="Usa Maquina Fiscal"
          checked={usaMaquinaFiscal}
          onChange={setUsaMaquinaFiscal}
          disabled={isSubmitting}
        />
        <CheckboxField
          id="fiscal-igtf"
          label="Aplica IGTF"
          checked={aplicaIgtf}
          onChange={setAplicaIgtf}
          disabled={isSubmitting}
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-input text-primary focus:ring-ring disabled:opacity-50"
      />
      <Label htmlFor={id} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  )
}
