import { Calendar } from '@/components/ui/calendar'

interface Props {
  selectedDate: Date
  onSelect: (date: Date) => void
  appointmentsByDate?: Record<string, boolean>
}

export function MiniCalendarioCitas({ selectedDate, onSelect }: Props) {
  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl p-2 shadow-sm overflow-hidden">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={(date) => date && onSelect(date)}
        className="rounded-xl border-0 p-0 w-full"
        classNames={{
          month_caption: 'flex justify-center pt-1 relative items-center mb-2',
          caption_label: 'text-xs font-bold text-slate-700',
          weekday: 'text-[10px] font-bold text-slate-400 w-8 text-center uppercase',
          week: 'flex w-full mt-1 gap-0',
          day: 'h-8 w-8 text-center text-sm p-0 relative',
          day_button:
            'h-8 w-8 p-0 text-[11px] font-semibold rounded-lg hover:bg-slate-100 transition-colors',
          selected: 'bg-primary/10 text-primary hover:bg-primary/20 rounded-lg',
          today: 'font-extrabold text-primary',
          outside: 'opacity-25',
        }}
      />
    </div>
  )
}
