import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import './index.css'

import { AuthProvider } from '@/core/auth/auth-provider'
import { PowerSyncProvider } from '@/core/db/powersync/provider'
import { db } from '@/core/db/powersync/db'
import { connector } from '@/core/db/powersync/connector'
import { initCurrencyConfig } from '@/lib/currency'

import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Inicializar tema desde localStorage para evitar flash al cargar
try {
  const themeColors: Record<string, string> = {
    clara: '#2563eb', jade: '#059669', rosa: '#db2777', violeta: '#7c3aed', ambar: '#d97706',
  }
  const raw = localStorage.getItem('clarapos-theme')
  const parsed = raw ? JSON.parse(raw) : null
  const savedTheme = parsed?.state?.theme ?? 'clara'
  document.documentElement.setAttribute('data-theme', savedTheme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[savedTheme] ?? '#2563eb')
} catch {
  document.documentElement.setAttribute('data-theme', 'clara')
}

/**
 * Load system_settings from PowerSync SQLite and configure decimal precision.
 * Falls back to hardcoded defaults if table is empty or query fails.
 * Called once at app startup, before RouterProvider renders.
 */
async function loadCurrencyConfig(): Promise<void> {
  const DEFAULTS = {
    precisionCalc: 8,
    precisionView: 2,
    roundingMode: Decimal.ROUND_HALF_UP as Decimal.Rounding,
  }

  try {
    await db.init()

    const rows = await db.getAll<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings'
    )

    if (!rows || rows.length === 0) {
      initCurrencyConfig(DEFAULTS)
      return
    }

    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }

    const precisionCalc = settings['precision_calc']
      ? parseInt(settings['precision_calc'], 10)
      : DEFAULTS.precisionCalc

    const precisionView = settings['precision_view']
      ? parseInt(settings['precision_view'], 10)
      : DEFAULTS.precisionView

    const roundingModeRaw = settings['rounding_mode']
      ? parseInt(settings['rounding_mode'], 10)
      : DEFAULTS.roundingMode

    // Validate rounding mode is within decimal.js valid range (0–8)
    const roundingMode: Decimal.Rounding =
      roundingModeRaw >= 0 && roundingModeRaw <= 8
        ? (roundingModeRaw as Decimal.Rounding)
        : DEFAULTS.roundingMode

    const config = { precisionCalc, precisionView, roundingMode }
    initCurrencyConfig(config)
  } catch (err) {
    console.warn('[ClaraPOS] system_settings load failed, using defaults:', err)
    initCurrencyConfig(DEFAULTS)
  }
}

/**
 * Restaura la sesión persistida ANTES de montar el árbol de React.
 *
 * Los guards de ruta (beforeLoad en /_app, /, /(auth)) leen `connector.currentSession`
 * de forma síncrona. Si el connector se inicializa recién dentro de PowerSyncProvider
 * (ya montado), existe una ventana donde `currentSession` es null aunque haya un token
 * válido en localStorage → el guard redirige a /login (falso deslogueo, sobre todo al
 * refrescar la página estando offline). Inicializar acá elimina esa race condition:
 * cuando el árbol monta, `currentSession` ya refleja la sesión persistida.
 *
 * connector.init() es idempotente (early-return por `this.ready`), así que la llamada
 * posterior dentro de PowerSyncProvider no repite el trabajo.
 */
async function bootstrapSession(): Promise<void> {
  try {
    await connector.init()
  } catch (err) {
    // Sin red o localStorage inaccesible: seguimos igual. Si había sesión válida,
    // getSession() la restaura offline; si no, el usuario verá /login (correcto).
    console.warn('[ClaraPOS] bootstrap de sesion fallo, continuando:', err)
  }
}

// Restaurar sesión y config antes de renderizar la app
Promise.all([loadCurrencyConfig(), bootstrapSession()]).then(() => {
  const rootElement = document.getElementById('app')!
  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PowerSyncProvider>
              <RouterProvider router={router} />
            </PowerSyncProvider>
          </AuthProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  }
})
