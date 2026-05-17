import { useState } from 'react'
import { useCitaWizardStore, type CheckoutTipo } from '@/stores/cita-wizard-store'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CalendarDots,
  CurrencyDollar,
  CreditCard,
  User,
  Clock,
  Stethoscope,
  NotePencil,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const CHECKOUT_OPTIONS: { tipo: CheckoutTipo; titulo: string; desc: string; color: string }[] = [
  {
    tipo: 'RESERVA',
    titulo: 'Solo Reservar',
    desc: 'Registra la cita sin cobro. El pago se procesa en el Panel de Trabajo.',
    color: 'border-blue-300 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200',
  },
  {
    tipo: 'POS',
    titulo: 'Procesar Pago (POS)',
    desc: 'Cobra ahora y genera factura automaticamente.',
    color: 'border-green-300 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-200',
  },
  {
    tipo: 'CREDITO',
    titulo: 'Asignar a Credito',
    desc: 'Registra la deuda en la cuenta del cliente. Emite factura a credito.',
    color: 'border-orange-300 bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200',
  },
]

export function StepCheckout() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const {
    clienteNombre,
    servicios,
    fecha,
    horaInicio,
    horaFin,
    duracionTotalMin,
    asignacionPersonal,
    profesionalNombre,
    checkoutTipo,
    pago,
    observaciones,
    setCheckoutTipo,
    setPago,
    setObservaciones,
    totalUsd,
  } = useCitaWizardStore()

  const [metodoPagoId, setMetodoPagoId] = useState(pago?.metodoCobroId ?? '')
  const [monto, setMonto] = useState(pago?.monto?.toFixed(2) ?? totalUsd().toFixed(2))
  const [referencia, setReferencia] = useState(pago?.referencia ?? '')

  const { data: metodosData } = useQuery(
    empresaId
      ? 'SELECT id, nombre, requiere_referencia FROM metodos_cobro WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre'
      : '',
    empresaId ? [empresaId] : []
  )
  const metodos = (metodosData ?? []) as { id: string; nombre: string; requiere_referencia: number }[]
  const metodoSeleccionado = metodos.find((m) => m.id === metodoPagoId)

  const handleMetodoChange = (id: string) => {
    setMetodoPagoId(id)
    const m = metodos.find((x) => x.id === id)
    setPago({ metodoCobroId: id, metodoCobro: m?.nombre ?? '', monto: parseFloat(monto), referencia })
  }

  const handleMontoChange = (v: string) => {
    setMonto(v)
    if (metodoPagoId) {
      setPago({
        metodoCobroId: metodoPagoId,
        metodoCobro: metodoSeleccionado?.nombre ?? '',
        monto: parseFloat(v) || 0,
        referencia,
      })
    }
  }

  const handleReferenciaChange = (v: string) => {
    setReferencia(v)
    if (metodoPagoId) {
      setPago({
        metodoCobroId: metodoPagoId,
        metodoCobro: metodoSeleccionado?.nombre ?? '',
        monto: parseFloat(monto),
        referencia: v,
      })
    }
  }

  const fechaDisplay = fecha
    ? format(new Date(fecha + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })
    : ''

  const duracion = duracionTotalMin()
  const profesional = profesionalNombre()

  return (
    <div className="space-y-5">
      {/* Resumen de la cita */}
      <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-3">
          Resumen de la Cita
        </p>
        <div className="flex items-center gap-2">
          <User size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium">{clienteNombre}</span>
        </div>
        {profesional && (
          <div className="flex items-center gap-2">
            <Stethoscope size={14} className="text-muted-foreground shrink-0" />
            <span>{profesional}</span>
          </div>
        )}
        {asignacionPersonal.length > 1 && (
          <div className="ml-6 space-y-0.5">
            {asignacionPersonal.map((a) => (
              <div key={a.servicioIdx} className="text-xs text-muted-foreground">
                {servicios[a.servicioIdx]?.nombre}: {a.trabajadorNombre}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <CalendarDots size={14} className="text-muted-foreground shrink-0" />
          <span className="capitalize">{fechaDisplay}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted-foreground shrink-0" />
          <span>
            {horaInicio} - {horaFin} ({duracion} min)
          </span>
        </div>

        {/* Servicios */}
        <div className="pt-2 border-t space-y-0.5">
          {servicios.map((s) => (
            <div key={s.productoId} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{s.nombre}</span>
              <span className="font-medium">{formatUsd(s.precioUsd)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 border-t mt-1 font-semibold">
            <span>Total</span>
            <span className="text-primary">{formatUsd(totalUsd())}</span>
          </div>
        </div>
      </div>

      {/* Forma de cobro */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Forma de Cobro</p>
        <div className="grid gap-2">
          {CHECKOUT_OPTIONS.map((opt) => (
            <button
              key={opt.tipo}
              onClick={() => setCheckoutTipo(opt.tipo)}
              className={cn(
                'p-3 rounded-xl border-2 text-left transition-all',
                checkoutTipo === opt.tipo
                  ? opt.color
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              <div className="font-medium text-sm">{opt.titulo}</div>
              <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Formulario de pago si es POS */}
      {checkoutTipo === 'POS' && (
        <div className="space-y-3 border rounded-xl p-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <CreditCard size={16} />
            Datos del Pago
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Metodo de Cobro</Label>
            <Select value={metodoPagoId} onValueChange={handleMetodoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {metodos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Monto (USD)</Label>
            <div className="relative">
              <CurrencyDollar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="number"
                step="0.01"
                value={monto}
                onChange={(e) => handleMontoChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {metodoSeleccionado?.requiere_referencia === 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Numero de Referencia</Label>
              <Input
                placeholder="Ref. de pago..."
                value={referencia}
                onChange={(e) => handleReferenciaChange(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Observaciones */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <NotePencil size={16} />
          Observaciones (opcional)
        </label>
        <Textarea
          placeholder="Notas adicionales sobre la cita..."
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  )
}
