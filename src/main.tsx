import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import './index.css'

import { AuthProvider } from '@/core/auth/auth-provider'
import { PowerSyncProvider } from '@/core/db/powersync/provider'
import { db } from '@/core/db/powersync/db'
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
      console.log('[ClaraPOS] initCurrencyConfig called with defaults (system_settings empty):', DEFAULTS)
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
    console.log('[ClaraPOS] initCurrencyConfig called with:', config)
    initCurrencyConfig(config)
  } catch (err) {
    console.warn('[ClaraPOS] system_settings load failed, using defaults:', err)
    console.log('[ClaraPOS] initCurrencyConfig called with defaults:', DEFAULTS)
    initCurrencyConfig(DEFAULTS)
  }
}

// Load currency config before rendering the app
loadCurrencyConfig().then(() => {
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
