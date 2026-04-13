import { createFileRoute } from '@tanstack/react-router'
import { UsuarioFormPage } from '@/features/configuracion/components/usuario-form-page'

export const Route = createFileRoute('/_app/configuracion/usuarios/nuevo')({
  component: NuevoUsuarioPage,
})

function NuevoUsuarioPage() {
  return <UsuarioFormPage mode="create" />
}
