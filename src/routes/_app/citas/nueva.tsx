import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useCitaWizardStore } from '@/stores/cita-wizard-store'

export const Route = createFileRoute('/_app/citas/nueva')({
  component: NuevaCitaRedirect,
})

function NuevaCitaRedirect() {
  const navigate = useNavigate()
  const { openSheet } = useCitaWizardStore()

  useEffect(() => {
    openSheet()
    navigate({ to: '/citas/calendario' as any, replace: true })
  }, [])

  return null
}
