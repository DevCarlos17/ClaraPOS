import { Link } from '@tanstack/react-router'
import { ShieldWarning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export function AccessDeniedPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="p-4 rounded-2xl bg-destructive/10">
          <ShieldWarning className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Acceso denegado</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          No tienes permisos para acceder a esta seccion. Contacta al administrador si necesitas acceso.
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link to="/dashboard">Volver al Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
