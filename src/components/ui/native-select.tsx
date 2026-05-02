import { forwardRef } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-xl border border-input bg-background px-3 py-2 pr-9 text-sm text-foreground cursor-pointer',
            'focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-[color,box-shadow]',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
      </div>
    )
  }
)

NativeSelect.displayName = 'NativeSelect'
