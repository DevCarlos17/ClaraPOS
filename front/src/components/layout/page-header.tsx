interface PageHeaderProps {
  titulo: string
  descripcion?: string
  children?: React.ReactNode
}

export function PageHeader({ titulo, descripcion, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground mt-1">{descripcion}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
