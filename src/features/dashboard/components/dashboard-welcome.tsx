import { useCurrentUser } from '@/core/hooks/use-current-user'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function DashboardWelcome() {
  const { user } = useCurrentUser()
  const today = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        Bienvenido(a), {user?.nombre ?? 'Usuario'}
      </h1>
      <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
    </div>
  )
}
