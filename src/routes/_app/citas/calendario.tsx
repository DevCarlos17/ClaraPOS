import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CalendarioCitas } from '@/features/citas/components/calendario/calendario-citas'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { useGoogleCalendarStatus, iniciarConexionGoogleCalendar } from '@/features/citas/hooks/use-google-calendar'
import { GoogleLogo, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/citas/calendario')({
  component: CalendarioCitasPage,
})

function GoogleCalendarBanner() {
  const { connected, loading } = useGoogleCalendarStatus()
  const [dismissed, setDismissed] = useState(false)
  const [conectando, setConectando] = useState(false)

  if (loading || connected || dismissed) return null

  const handleConectar = async () => {
    setConectando(true)
    try {
      await iniciarConexionGoogleCalendar()
      toast.success('Google Calendar conectado')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al conectar'
      toast.error(msg)
    } finally {
      setConectando(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
      <GoogleLogo size={16} weight="fill" className="shrink-0 text-[#4285F4]" />
      <span className="flex-1">
        Conecta tu Google Calendar para ver tu disponibilidad real al agendar citas.
      </span>
      <Button
        size="sm"
        onClick={handleConectar}
        disabled={conectando}
        className="h-7 bg-[#4285F4] hover:bg-[#3367D6] text-white text-xs px-3"
      >
        <GoogleLogo size={13} weight="fill" className="mr-1" />
        {conectando ? 'Conectando...' : 'Conectar'}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
        aria-label="Cerrar"
      >
        <X size={15} />
      </button>
    </div>
  )
}

function CalendarioCitasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CITAS_VIEW} fallback={<AccessDeniedPage />}>
      <div className="flex flex-col h-[calc(100vh-5rem)] p-4 gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Agenda</h1>
            <p className="text-sm text-muted-foreground">Calendario de citas y disponibilidad</p>
          </div>
        </div>
        <GoogleCalendarBanner />
        <div className="flex-1 overflow-hidden">
          <CalendarioCitas />
        </div>
      </div>
    </RequirePermission>
  )
}
