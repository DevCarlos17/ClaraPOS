import { useEffect } from 'react'
import { usePageTitleStore } from '@/stores/page-title-store'

interface PageHeaderProps {
  titulo: string
  descripcion?: string
  children?: React.ReactNode
}

export function PageHeader({ titulo, descripcion, children }: PageHeaderProps) {
  const setTitulo = usePageTitleStore((state) => state.setTitulo)

  // Publica el titulo de la pantalla al store para que el TopBar lo muestre en
  // el header sticky en mobile (donde el bloque de titulo de abajo se oculta).
  useEffect(() => {
    setTitulo(titulo)
    return () => setTitulo('')
  }, [titulo, setTitulo])

  // En mobile el titulo/descripcion viven en el TopBar sticky, por eso el bloque
  // de titulo se oculta (hidden lg:block). Los children (acciones) SIEMPRE se
  // muestran para no perder botones de accion en mobile. Si no hay children el
  // contenedor no reserva espacio en mobile.
  return (
    <div className="flex items-center justify-between empty:hidden">
      <div className="hidden lg:block">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground mt-1">{descripcion}</p>}
      </div>
      {children && <div className="flex items-center gap-2 ml-auto">{children}</div>}
    </div>
  )
}
