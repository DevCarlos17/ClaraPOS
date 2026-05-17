// Edge Function: google-calendar-auth
// Maneja el flujo OAuth con Google Calendar por usuario
//
// Acciones:
//   GET ?action=url        → devuelve la URL de autorización de Google
//   GET ?action=callback   → intercambia el code por tokens y los guarda
//   GET ?action=status     → verifica si el usuario tiene Google Calendar conectado
//   POST ?action=disconnect → desconecta el Google Calendar del usuario
//
// NOTA: La redirect_uri debe estar registrada en Google Cloud Console.
// Ver docs/configuracion-google-calendar.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

// La redirect_uri es esta misma función (el callback llega con ?code=xxx)
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar-auth`

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ')

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  // Google envía el callback con ?code= (sin action param)
  const action = url.searchParams.get('action') ?? (url.searchParams.has('code') ? 'callback' : null)

  // ── action=url : generar URL de autorización ────────────────────────────
  if (action === 'url') {
    const { user, error } = await getAuthUser(req)
    if (error || !user) return json({ error: 'No autorizado' }, 401)

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id')
      .eq('id', user.id)
      .single()

    if (!usuario) return json({ error: 'Usuario no encontrado' }, 404)

    // Codificar userId y empresaId en el state para recuperarlos en el callback
    const state = btoa(JSON.stringify({ userId: user.id, empresaId: usuario.empresa_id }))

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent') // forzar refresh_token siempre
    authUrl.searchParams.set('state', state)

    return json({ url: authUrl.toString() })
  }

  // ── action=callback : Google redirige aquí con ?code=xxx&state=xxx ──────
  if (action === 'callback') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const errorParam = url.searchParams.get('error')

    if (errorParam) {
      return htmlResponse(pageResult('error', `Google rechazó la autorización: ${errorParam}`))
    }

    if (!code || !state) {
      return htmlResponse(pageResult('error', 'Parámetros inválidos en el callback.'))
    }

    let userId: string
    let empresaId: string
    try {
      const decoded = JSON.parse(atob(state))
      userId = decoded.userId
      empresaId = decoded.empresaId
    } catch {
      return htmlResponse(pageResult('error', 'State inválido.'))
    }

    // Intercambiar el code por access_token + refresh_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      const msg = tokenData.error_description ?? tokenData.error ?? 'Error desconocido'
      return htmlResponse(pageResult('error', `Error al obtener tokens de Google: ${msg}`))
    }

    const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    await supabaseAdmin
      .from('google_calendar_tokens')
      .upsert({
        usuario_id: userId,
        empresa_id: empresaId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        token_expiry: expiry,
        calendar_id: 'primary',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'usuario_id' })

    return htmlResponse(pageResult('success'))
  }

  // ── action=status : verificar conexión ──────────────────────────────────
  if (action === 'status') {
    const { user, error } = await getAuthUser(req)
    if (error || !user) return json({ error: 'No autorizado' }, 401)

    const { data } = await supabaseAdmin
      .from('google_calendar_tokens')
      .select('is_active, calendar_id, updated_at')
      .eq('usuario_id', user.id)
      .single()

    return json({ connected: !!(data?.is_active), updatedAt: data?.updated_at ?? null })
  }

  // ── action=disconnect : desconectar ──────────────────────────────────────
  if (action === 'disconnect') {
    const { user, error } = await getAuthUser(req)
    if (error || !user) return json({ error: 'No autorizado' }, 401)

    await supabaseAdmin
      .from('google_calendar_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('usuario_id', user.id)

    return json({ ok: true })
  }

  return json({ error: 'Accion no reconocida. Usa ?action=url|status|disconnect' }, 400)
})

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return { user: data?.user ?? null, error }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function htmlResponse(html: string) {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function pageResult(tipo: 'success' | 'error', mensaje?: string) {
  const esExito = tipo === 'success'
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Google Calendar - ClaraPOS</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
.card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
.icon{font-size:48px;margin-bottom:16px} .title{font-size:20px;font-weight:700;margin:0 0 8px}
.msg{color:#64748b;font-size:14px;margin:0 0 24px} .btn{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer}</style>
</head>
<body><div class="card">
  <div class="icon">${esExito ? '✅' : '❌'}</div>
  <p class="title">${esExito ? 'Google Calendar Conectado' : 'Error al Conectar'}</p>
  <p class="msg">${esExito ? 'Puedes cerrar esta ventana. Tu calendario ya está sincronizado.' : (mensaje ?? 'Ocurrió un error inesperado.')}</p>
  <button class="btn" onclick="window.close()">Cerrar</button>
</div>
<script>
if (${esExito} && window.opener) {
  window.opener.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED' }, '*');
}
setTimeout(() => window.close(), ${esExito ? 2000 : 5000});
</script>
</body></html>`
}
