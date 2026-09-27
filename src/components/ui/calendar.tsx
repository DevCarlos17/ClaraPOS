import * as React from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Rango de anios por defecto para los dropdowns de mes/anio: desde 2020
// hasta el anio proximo. Permite saltar de anio sin clickear mes a mes.
const DEFAULT_START_MONTH = new Date(2020, 0)
const DEFAULT_END_MONTH = new Date(new Date().getFullYear() + 1, 11)

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'dropdown',
  startMonth = DEFAULT_START_MONTH,
  endMonth = DEFAULT_END_MONTH,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-y-4 sm:gap-y-0 sm:gap-x-4',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: cn(
          'text-sm font-medium',
          // Con captionLayout="dropdown" el label real se reemplaza por los
          // <select>; se muestra como el texto visible del dropdown.
          captionLayout !== 'label' &&
            'inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-sm [&>svg]:size-3.5 [&>svg]:opacity-50'
        ),
        dropdowns: 'flex items-center justify-center gap-1.5',
        dropdown_root: 'relative',
        // <select> nativo transparente por encima del caption_label visible
        // (patron shadcn rdp v9): captura el click/teclado sin romper el estilo.
        dropdown: 'absolute inset-0 h-full w-full cursor-pointer opacity-0',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100'
        ),
        range_end: 'day-range-end',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside:
          'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === 'left' ? CaretLeft : CaretRight
          return <Icon className="h-4 w-4" />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'
