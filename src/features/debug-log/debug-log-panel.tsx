import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useDebugLogStore, type DebugEvento } from '@/lib/debug-log'

const NIVEL_COLORS: Record<DebugEvento['nivel'], string> = {
  info: 'text-gray-400',
  ok: 'text-emerald-400',
  error: 'text-red-400',
}

const NIVEL_BG: Record<DebugEvento['nivel'], string> = {
  info: 'bg-gray-500/20',
  ok: 'bg-emerald-500/20',
  error: 'bg-red-500/20',
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function downloadJson(eventos: DebugEvento[]): void {
  const blob = new Blob([JSON.stringify(eventos, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `debug-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadExcel(eventos: DebugEvento[]): void {
  const rows = eventos.map((e) => ({
    timestamp: e.timestamp,
    usuarioEmail: e.usuarioEmail ?? '',
    empresaId: e.empresaId ?? '',
    accion: e.accion,
    nivel: e.nivel,
    detalle: e.detalle ? JSON.stringify(e.detalle) : '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Log')
  XLSX.writeFile(wb, `debug-log-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function DebugLogPanel() {
  const [open, setOpen] = useState(false)
  const eventos = useDebugLogStore((s) => s.eventos)
  const clear = useDebugLogStore((s) => s.clear)

  function handleClear() {
    if (window.confirm(`¿Limpiar ${eventos.length} evento(s) del log?`)) {
      clear()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-3 py-1.5 shadow-lg hover:bg-gray-800 transition-colors"
        title="Debug Log"
      >
        <span className="font-mono font-bold text-yellow-400">DBG</span>
        <span className="bg-gray-700 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
          {eventos.length}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="w-[480px] max-h-[70vh] bg-gray-950 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
            <span className="font-semibold text-gray-200 font-mono">Debug Log</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => downloadJson(eventos)}
                disabled={eventos.length === 0}
                className="px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white transition-colors"
              >
                JSON
              </button>
              <button
                onClick={() => downloadExcel(eventos)}
                disabled={eventos.length === 0}
                className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
              >
                Excel
              </button>
              <button
                onClick={handleClear}
                disabled={eventos.length === 0}
                className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Events list */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-800">
            {eventos.length === 0 && (
              <p className="text-gray-500 text-center py-6">Sin eventos registrados</p>
            )}
            {eventos.map((e) => (
              <div key={e.id} className="px-3 py-2 hover:bg-gray-900/60">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-gray-500 font-mono shrink-0">{formatTimestamp(e.timestamp)}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-[10px] ${NIVEL_COLORS[e.nivel]} ${NIVEL_BG[e.nivel]}`}>
                    {e.nivel}
                  </span>
                  <span className="font-mono font-semibold text-gray-100 truncate">{e.accion}</span>
                </div>
                {e.detalle && (
                  <pre className="text-gray-400 font-mono text-[10px] leading-relaxed truncate max-w-full">
                    {JSON.stringify(e.detalle)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
