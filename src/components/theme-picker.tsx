import { Palette, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { THEMES, useThemeStore } from '@/stores/theme-store'
import { cn } from '@/lib/utils'

export function ThemePicker() {
  const { theme, setTheme } = useThemeStore()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Cambiar tema de color"
        >
          <Palette className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2.5">Color del sistema</p>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
              aria-label={t.name}
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-150 group-hover:scale-110',
                  theme === t.id && 'ring-2 ring-offset-2 ring-offset-background'
                )}
                style={{
                  backgroundColor: t.color,
                  // ring color same as the swatch
                  '--tw-ring-color': t.color,
                } as React.CSSProperties}
              >
                {theme === t.id && (
                  <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
                )}
              </span>
              <span className={cn(
                'text-[10px] font-medium transition-colors',
                theme === t.id ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
