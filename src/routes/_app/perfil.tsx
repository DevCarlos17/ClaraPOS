import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { GoogleCalendarConfig } from '@/features/perfil/components/google-calendar-config'
import { UserCircle } from '@phosphor-icons/react'
import { Separator } from '@/components/ui/separator'

export const Route = createFileRoute('/_app/perfil')({
  component: PerfilPage,
})

function PerfilPage() {
  const { user } = useCurrentUser()

  return (
    <div className="space-y-6">
      <PageHeader titulo="Mi Perfil" descripcion="Configuración de tu cuenta y conexiones" />

      {/* Info del usuario */}
      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
            <UserCircle size={32} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">{user?.nombre ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{user?.email ?? '—'}</p>
            {user?.rol_nombre && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary mt-1 inline-block">
                {user.rol_nombre}
              </span>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Integraciones */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Integraciones
        </h2>
        <GoogleCalendarConfig />
      </div>
    </div>
  )
}
