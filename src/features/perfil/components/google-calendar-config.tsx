import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useGoogleCalendarStatus, iniciarConexionGoogleCalendar, desconectarGoogleCalendar } from '@/features/citas/hooks/use-google-calendar'
import { toast } from 'sonner'
import { GoogleLogo, CheckCircle, XCircle, ArrowsClockwise } from '@phosphor-icons/react'

export function GoogleCalendarConfig() {
  const { connected, loading, recheck } = useGoogleCalendarStatus()
  const [procesando, setProcesando] = useState(false)

  const handleConectar = async () => {
    setProcesando(true)
    try {
      await iniciarConexionGoogleCalendar()
      await recheck()
      toast.success('Google Calendar conectado correctamente')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al conectar'
      toast.error(msg)
    } finally {
      setProcesando(false)
    }
  }

  const handleDesconectar = async () => {
    setProcesando(true)
    try {
      await desconectarGoogleCalendar()
      await recheck()
      toast.success('Google Calendar desconectado')
    } catch {
      toast.error('Error al desconectar')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center shadow-sm">
          <GoogleLogo size={22} weight="fill" className="text-[#4285F4]" />
        </div>
        <div>
          <p className="font-semibold text-sm">Google Calendar</p>
          <p className="text-xs text-muted-foreground">
            Sincroniza tus citas automáticamente con tu calendario de Google
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowsClockwise size={16} className="animate-spin" />
          Verificando estado...
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2.5 border border-green-200">
            <CheckCircle size={16} weight="fill" />
            <span className="font-medium">Conectado</span>
            <span className="text-green-600 ml-1">— Las citas se sincronizan automáticamente</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDesconectar}
            disabled={procesando}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2"
          >
            <XCircle size={16} />
            {procesando ? 'Desconectando...' : 'Desconectar Google Calendar'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-2.5 border">
            <XCircle size={16} />
            <span>No conectado</span>
          </div>
          <Button
            size="sm"
            onClick={handleConectar}
            disabled={procesando}
            className="gap-2 bg-[#4285F4] hover:bg-[#3367D6] text-white"
          >
            <GoogleLogo size={16} weight="fill" />
            {procesando ? 'Conectando...' : 'Conectar con Google'}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t pt-3">
        Al conectar, tus citas aparecerán en tu Google Calendar personal. Cada profesional
        gestiona su propia conexión de forma independiente.
      </p>
    </div>
  )
}
