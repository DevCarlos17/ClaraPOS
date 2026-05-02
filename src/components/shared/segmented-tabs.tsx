import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string = string> {
  key: T
  label: string
  count?: number
}

interface SegmentedTabsProps<T extends string = string> {
  tabs: TabItem<T>[]
  active: T
  onChange: (key: T) => void
  className?: string
  layoutId?: string
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  layoutId = 'tab-indicator',
}: SegmentedTabsProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-stretch rounded-t-lg border border-b-0 bg-white dark:bg-card shadow-sm overflow-hidden divide-x divide-border',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors duration-150 select-none',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80 hover:bg-muted/30',
            )}
          >
            <span>{tab.label}</span>

            {tab.count !== undefined && (
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  isActive ? 'text-primary' : 'text-muted-foreground/70',
                )}
              >
                ({tab.count})
              </span>
            )}

            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

// Content animation variants — export so pages can reuse them
export const tabContentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -5, transition: { duration: 0.14, ease: 'easeIn' } },
} as const
