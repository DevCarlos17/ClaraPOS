import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/components/login-page'

export const Route = createFileRoute('/(auth)/login')({
  component: LoginPage,
})
