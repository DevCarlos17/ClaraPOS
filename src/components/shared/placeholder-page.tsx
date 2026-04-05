import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/page-header'

interface PlaceholderPageProps {
  titulo: string
  descripcion: string
  icon: React.ComponentType<{ className?: string }>
}

export function PlaceholderPage({ titulo, descripcion, icon: Icon }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader titulo={titulo} descripcion={descripcion} />
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="p-4 rounded-2xl bg-muted">
            <Icon className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{descripcion}</p>
          <Badge variant="secondary" className="text-xs">
            Proximamente
          </Badge>
        </div>
      </div>
    </div>
  )
}
