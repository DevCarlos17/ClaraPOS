// Edge Function: google-calendar-sync
// Sincroniza citas de ClaraPOS con el Google Calendar del profesional asignado
//
// Body (POST JSON):
//   action: 'create' | 'update' | 'delete' | 'freebusy'
//   profesional_id: string
//   cita: { fecha_inicio, fecha_fin, cliente_nombre?, servicios?, notas?, status?, google_event_id? }
//   -- Solo para freebusy:
//   timeMin: string (ISO)
//   timeMax: string (ISO)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Verificar autenticación
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return json({ error: 'No autorizado' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body JSON inválido' }, 400)
  }

  const { action, profesional_id, cita, timeMin, timeMax } = body as {
    action: string
    profesional_id: string
    cita?: CitaSync
    timeMin?: string
    timeMax?: string
  }

  if (!profesional_id) return json({ error: 'Falta profesional_id' }, 400)

  // Obtener tokens del profesional
  const { data: tokenRow } = await supabaseAdmin
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, token_expiry, calendar_id, usuario_id')
    .eq('usuario_id', profesional_id)
    .eq('is_active', true)
    .single()

  if (!tokenRow) {
    // El profesional no tiene Google Calendar conectado — no es error
    return json({ ok: true, skipped: true, reason: 'no_token' })
  }

  // Obtener access token válido (refrescando si expiró)
  const accessToken = await getValidAccessToken(tokenRow)
  if (!accessToken) {
    return json({ ok: true, skipped: true, reason: 'token_refresh_failed' })
  }

  const calendarId = tokenRow.calendar_id ?? 'primary'

  // ── CREATE ──────────────────────────────────────────────────────────────
  if (action === 'create') {
    if (!cita) return json({ error: 'Falta cita' }, 400)
    const event = buildEvent(cita)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    )
    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message ?? 'Error Google Calendar' }, 500)
    return json({ ok: true, google_event_id: data.id })
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!cita?.google_event_id) return json({ ok: true, skipped: true, reason: 'no_event_id' })
    const event = buildEvent(cita)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${cita.google_event_id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    )
    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message ?? 'Error Google Calendar' }, 500)
    return json({ ok: true })
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!cita?.google_event_id) return json({ ok: true, skipped: true, reason: 'no_event_id' })
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${cita.google_event_id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    // 404/410 = ya fue borrado, no es error
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const data = await res.json()
      return json({ error: data.error?.message ?? 'Error Google Calendar' }, 500)
    }
    return json({ ok: true })
  }

  // ── FREEBUSY ────────────────────────────────────────────────────────────
  if (action === 'freebusy') {
    if (!timeMin || !timeMax) return json({ error: 'Faltan timeMin y timeMax' }, 400)
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
    })
    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message ?? 'Error Google Calendar' }, 500)
    const busy = (data.calendars?.[calendarId]?.busy ?? []) as { start: string; end: string }[]
    return json({ ok: true, busy })
  }

  return json({ error: 'Accion no reconocida. Usa create|update|delete|freebusy' }, 400)
})

// ── Types ────────────────────────────────────────────────────────────────────

interface CitaSync {
  fecha_inicio: string
  fecha_fin: string
  cliente_nombre?: string
  servicios?: string[]
  notas?: string | null
  status?: string
  google_event_id?: string | null
}

interface TokenRow {
  access_token: string
  refresh_token: string | null
  token_expiry: string | null
  calendar_id: string
  usuario_id: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getValidAccessToken(tokenRow: TokenRow): Promise<string | null> {
  const bufferMs = 5 * 60 * 1000 // 5 minutos de buffer
  const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : 0

  if (Date.now() + bufferMs < expiry) {
    return tokenRow.access_token
  }

  // Token expirado — refrescar
  if (!tokenRow.refresh_token) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) return null

  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabaseAdmin
    .from('google_calendar_tokens')
    .update({ access_token: data.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
    .eq('usuario_id', tokenRow.usuario_id)

  return data.access_token
}

function buildEvent(cita: CitaSync) {
  const cancelada = cita.status === 'CANCELADA' || cita.status === 'NO_SHOW'
  const sufijo = cita.status === 'CANCELADA' ? ' [Cancelada]'
    : cita.status === 'NO_SHOW' ? ' [No se presentó]' : ''

  const lines: string[] = []
  if (cita.servicios?.length) lines.push(`Servicios: ${cita.servicios.join(', ')}`)
  if (cita.notas) lines.push(`Notas: ${cita.notas}`)
  lines.push('Agendado desde ClaraPOS')

  return {
    summary: `${cita.cliente_nombre ?? 'Cliente'}${sufijo}`,
    description: lines.join('\n'),
    start: { dateTime: cita.fecha_inicio, timeZone: 'UTC' },
    end: { dateTime: cita.fecha_fin, timeZone: 'UTC' },
    status: cancelada ? 'cancelled' : 'confirmed',
    colorId: cancelada ? '11' : '1', // 11=tomato, 1=lavender
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
