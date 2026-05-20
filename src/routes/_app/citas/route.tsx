import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAgendaConfig } from '@/features/citas/hooks/use-agenda-config'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/citas')({
  component: CitasLayout,
})

function CitasLayout() {
  const { mostrarAgenda, isLoading } = useAgendaConfig()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !mostrarAgenda) {
      toast.info('El modulo de Agenda esta desactivado')
      navigate({ to: '/dashboard' })
    }
  }, [isLoading, mostrarAgenda, navigate])

  if (isLoading || !mostrarAgenda) return null

  return <Outlet />
}
