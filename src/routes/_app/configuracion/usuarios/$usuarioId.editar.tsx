import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@powersync/react'
import { Loader2 } from 'lucide-react'
import { UsuarioFormPage } from '@/features/configuracion/components/usuario-form-page'
import type { Usuario } from '@/features/configuracion/hooks/use-usuarios'

export const Route = createFileRoute('/_app/configuracion/usuarios/$usuarioId/editar')({
  component: EditarUsuarioPage,
})

function EditarUsuarioPage() {
  const { usuarioId } = Route.useParams()

  const { data, isLoading } = useQuery('SELECT * FROM usuarios WHERE id = ?', [usuarioId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const usuario = (data?.[0] as Usuario) ?? null

  if (!usuario) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-base font-medium">Usuario no encontrado</p>
      </div>
    )
  }

  return <UsuarioFormPage mode="edit" usuario={usuario} />
}
