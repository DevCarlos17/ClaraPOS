import { createFileRoute, redirect } from '@tanstack/react-router'
import { connector } from '@/core/db/powersync/connector'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (connector.currentSession) {
      throw redirect({ to: '/dashboard' })
    } else {
      throw redirect({ to: '/login' })
    }
  },
})
