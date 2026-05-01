import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

import { AuthProvider } from '@/core/auth/auth-provider'
import { PowerSyncProvider } from '@/core/db/powersync/provider'

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
