import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useEmpresaFiscal, actualizarEmpresaFiscal } from '../hooks/use-empresa-fiscal'

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
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        No se encontraron datos fiscales
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Datos actuales */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="font-semibold">Datos Fiscales Actuales</h3>
        </div>

        <div className="space-y-3">
          <FiscalDataRow label="Tipo Contribuyente" value={fiscal.tipo_contribuyente} />
          <FiscalDataRow label="Tipo Documento" value={fiscal.tipo_documento} />
          <FiscalDataRow label="Documento Identidad" value={fiscal.documento_identidad} />
          <FiscalDataRow
            label="Agente Retencion"
            value={fiscal.es_agente_retencion === 1 ? 'Si' : 'No'}
          />
          <FiscalDataRow label="Nro Providencia" value={fiscal.nro_providencia} />
          <FiscalDataRow
            label="% Ret. IVA"
            value={
              fiscal.porcentaje_retencion_iva != null
                ? `${parseFloat(fiscal.porcentaje_retencion_iva).toFixed(2)}%`
                : null
            }
          />
          <FiscalDataRow label="Codigo Sucursal SENIAT" value={fiscal.codigo_sucursal_seniat} />
          <FiscalDataRow
            label="Maquina Fiscal"
            value={fiscal.usa_maquina_fiscal === 1 ? 'Si' : 'No'}
          />
          <FiscalDataRow
            label="Aplica IGTF"
            value={fiscal.aplica_igtf === 1 ? 'Si' : 'No'}
          />
        </div>
      </div>

      {/* Formulario de edicion */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Editar Datos Fiscales</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo contribuyente */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-tipo-contribuyente">Tipo Contribuyente</Label>
            <select
              id="fiscal-tipo-contribuyente"
              value={tipoContribuyente}
              onChange={(e) => setTipoContribuyente(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Seleccione</option>
              <option value="ORDINARIO">ORDINARIO</option>
              <option value="ESPECIAL">ESPECIAL</option>
              <option value="FORMAL">FORMAL</option>
            </select>
          </div>

          {/* Tipo documento */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-tipo-doc">Tipo Documento</Label>
            <select
              id="fiscal-tipo-doc"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Seleccione</option>
              <option value="V">V</option>
              <option value="J">J</option>
              <option value="E">E</option>
              <option value="G">G</option>
              <option value="P">P</option>
            </select>
          </div>

          {/* Documento identidad */}
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

          {/* Nro providencia */}
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

          {/* Porcentaje retencion IVA */}
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

          {/* Codigo sucursal SENIAT */}
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

          {/* Checkboxes */}
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function FiscalDataRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        {value || <span className="text-muted-foreground italic">No definido</span>}
      </p>
    </div>
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
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
      />
      <Label htmlFor={id} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  )
}
