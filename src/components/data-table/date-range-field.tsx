import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarBlank } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Extraido de `facturas-empresa-tab.tsx` (WU2 -> WU3, datatable-referencia-
 * unificado / notas-credito-datatable): `DatePickerField` y el par
 * Desde–Hasta (`DateRangeField`) son ahora un componente COMPARTIDO — antes
 * vivian duplicados localmente en cada pestaña que necesitaba un rango de
 * fecha en su `toolbarSlot` (Facturas, y ahora Notas de credito). Cualquier
 * tabla futura que necesite el mismo control de rango debe importar de aca,
 * nunca copiar/pegar una version local nueva.
 */

export interface DatePickerFieldProps {
  ariaLabel: string
  placeholder: string
  /** 'yyyy-MM-dd', mismo shape que consumen los hooks de filtros (`useFacturasEmpresa`/`useNotasCredito`/etc). */
  value: string
  onChange: (value: string) => void
}

/**
 * Boton + Popover + `Calendar` (shadcn/react-day-picker `mode="single"`),
 * reemplaza el `<input type="date">` nativo (owner feedback: desalineado
 * con el buscador, look inconsistente con el resto de la UI shadcn).
 *
 * Correctitud de zona horaria (riesgo real, no cosmetico): `parseISO` de
 * date-fns parsea un string solo-fecha ('yyyy-MM-dd') como MEDIANOCHE
 * LOCAL — a diferencia de `new Date('yyyy-MM-dd')`, que el motor JS
 * interpreta como medianoche UTC (ISO 8601 estricto). En VET (UTC-4) esa
 * diferencia corre el dia un dia hacia atras al mostrarlo con getters
 * locales (`new Date('2026-09-01')` renderiza "31/08/2026" en hora local).
 * `react-day-picker` (`selected`/`onSelect`) y `format()` de date-fns
 * tambien operan con getters LOCALES — todo el round-trip
 * string -> parseISO -> Date -> Calendar -> Date -> format -> string queda
 * en hora local de punta a punta, sin cruzar nunca por UTC. Por eso NO se
 * usa `toISOString()` (siempre UTC) para volver a string.
 */
export function DatePickerField({ ariaLabel, placeholder, value, onChange }: DatePickerFieldProps) {
  const selected = value ? parseISO(value) : undefined
  const label = selected ? format(selected, 'dd/MM/yyyy', { locale: es }) : placeholder

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={ariaLabel}
          className="h-8 md:h-9 px-3 gap-2 font-normal text-xs md:text-sm text-foreground flex-1 sm:flex-none justify-start"
        >
          <CalendarBlank className="size-4 shrink-0 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => date && onChange(format(date, 'yyyy-MM-dd'))}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  )
}

export interface DateRangeValue {
  desde: string
  hasta: string
}

export interface DateRangeFieldProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

/** Presentacional: Desde/Hasta renderizados dentro del `toolbarSlot` del `DataTable`, en el grupo derecho del toolbar (junto a "Columnas"). */
export function DateRangeField({ value, onChange }: DateRangeFieldProps) {
  function set<K extends keyof DateRangeValue>(key: K, next: DateRangeValue[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0">
      <DatePickerField
        ariaLabel="Fecha desde"
        placeholder="Desde"
        value={value.desde}
        onChange={(v) => set('desde', v)}
      />
      <span className="text-xs text-muted-foreground">–</span>
      <DatePickerField
        ariaLabel="Fecha hasta"
        placeholder="Hasta"
        value={value.hasta}
        onChange={(v) => set('hasta', v)}
      />
    </div>
  )
}
