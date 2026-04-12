import { useState } from 'react'
import { useMovMetodoCobro } from '@/features/caja/hooks/use-mov-metodo-cobro'
import { useMovBancarios } from '@/features/caja/hooks/use-mov-bancarios'
import { usePaymentMethods } from '@/features/configuracion/hooks/use-payment-methods'
import { useBancos } from '@/features/configuracion/hooks/use-bancos'
import { formatDate } from '@/lib/format'

// ─── Badge helpers ────────────────────────────────────────────

function tipoBadgeMetodo(tipo: string) {
  const esPositivo = tipo === 'ENTRADA' || tipo === 'CREDITO'
  if (esPositivo) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        {tipo}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      {tipo}
    </span>
  )
}

function tipoBadgeBancario(tipo: string) {
  const esPositivo = tipo === 'ENTRADA' || tipo === 'CREDITO'
  if (esPositivo) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        {tipo}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      {tipo}
    </span>
  )
}

function validadoBadge(validado: number) {
  if (validado === 1) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        Si
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
      No
    </span>
  )
}

// ─── Skeleton de carga ────────────────────────────────────────

function TablaSkeletonMetodo() {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {['Fecha', 'Tipo', 'Origen', 'Monto', 'Saldo Anterior', 'Saldo Nuevo', 'Referencia'].map(
              (col) => (
                <th key={col} className="text-left px-4 py-3 font-medium text-gray-700">
                  {col}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-gray-100">
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaSkeletonBancario() {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {['Fecha', 'Tipo', 'Origen', 'Monto', 'Saldo Anterior', 'Saldo Nuevo', 'Referencia', 'Validado'].map(
              (col) => (
                <th key={col} className="text-left px-4 py-3 font-medium text-gray-700">
                  {col}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-gray-100">
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab: Por Metodo de Cobro ─────────────────────────────────

function TabMetodoCobro() {
  const [selectedMetodoId, setSelectedMetodoId] = useState<string | null>(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const { methods, isLoading: isLoadingMetodos } = usePaymentMethods()
  const { movimientos, isLoading } = useMovMetodoCobro(
    selectedMetodoId,
    fechaDesde || undefined,
    fechaHasta || undefined
  )

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Metodo de Cobro
          </label>
          <select
            value={selectedMetodoId ?? ''}
            onChange={(e) => setSelectedMetodoId(e.target.value || null)}
            disabled={isLoadingMetodos}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar metodo...</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fecha Desde
          </label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fecha Hasta
          </label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Contenido */}
      {!selectedMetodoId ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Seleccione un metodo de cobro</p>
          <p className="text-sm mt-1">
            Elija un metodo de cobro para ver sus movimientos
          </p>
        </div>
      ) : isLoading ? (
        <TablaSkeletonMetodo />
      ) : movimientos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Sin movimientos</p>
          <p className="text-sm mt-1">No hay movimientos para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Origen</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Monto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Saldo Anterior</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Saldo Nuevo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov) => (
                <tr
                  key={mov.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(mov.fecha)}
                  </td>
                  <td className="px-4 py-3">{tipoBadgeMetodo(mov.tipo)}</td>
                  <td className="px-4 py-3 text-gray-600">{mov.origen}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {parseFloat(mov.monto).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {parseFloat(mov.saldo_anterior).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {parseFloat(mov.saldo_nuevo).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {mov.doc_origen_ref ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Bancarios ───────────────────────────────────────────

function TabBancarios() {
  const [selectedBancoId, setSelectedBancoId] = useState<string | null>(null)
  const [fechaDesdeBanco, setFechaDesdeBanco] = useState('')
  const [fechaHastaBanco, setFechaHastaBanco] = useState('')

  const { bancos, isLoading: isLoadingBancos } = useBancos()
  const { movimientos, isLoading } = useMovBancarios(
    selectedBancoId,
    fechaDesdeBanco || undefined,
    fechaHastaBanco || undefined
  )

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Banco
          </label>
          <select
            value={selectedBancoId ?? ''}
            onChange={(e) => setSelectedBancoId(e.target.value || null)}
            disabled={isLoadingBancos}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar banco...</option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banco}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fecha Desde
          </label>
          <input
            type="date"
            value={fechaDesdeBanco}
            onChange={(e) => setFechaDesdeBanco(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fecha Hasta
          </label>
          <input
            type="date"
            value={fechaHastaBanco}
            onChange={(e) => setFechaHastaBanco(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Contenido */}
      {!selectedBancoId ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Seleccione un banco</p>
          <p className="text-sm mt-1">
            Elija una cuenta bancaria para ver sus movimientos
          </p>
        </div>
      ) : isLoading ? (
        <TablaSkeletonBancario />
      ) : movimientos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Sin movimientos</p>
          <p className="text-sm mt-1">No hay movimientos para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Origen</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Monto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Saldo Anterior</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Saldo Nuevo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Referencia</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Validado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov) => (
                <tr
                  key={mov.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(mov.fecha)}
                  </td>
                  <td className="px-4 py-3">{tipoBadgeBancario(mov.tipo)}</td>
                  <td className="px-4 py-3 text-gray-600">{mov.origen}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {parseFloat(mov.monto).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {parseFloat(mov.saldo_anterior).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {parseFloat(mov.saldo_nuevo).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {mov.referencia ?? '-'}
                  </td>
                  <td className="px-4 py-3">{validadoBadge(mov.validado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

type TabActiva = 'metodo' | 'bancario'

export function MovimientosList() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('metodo')

  return (
    <div className="rounded-xl border bg-card p-6">
      {/* Barra de tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-4">
        <button
          onClick={() => setTabActiva('metodo')}
          className={
            tabActiva === 'metodo'
              ? 'pb-3 text-sm border-b-2 border-blue-600 text-blue-600 font-medium'
              : 'pb-3 text-sm text-gray-500 hover:text-gray-700 transition-colors'
          }
        >
          Por Metodo de Cobro
        </button>
        <button
          onClick={() => setTabActiva('bancario')}
          className={
            tabActiva === 'bancario'
              ? 'pb-3 text-sm border-b-2 border-blue-600 text-blue-600 font-medium'
              : 'pb-3 text-sm text-gray-500 hover:text-gray-700 transition-colors'
          }
        >
          Bancarios
        </button>
      </div>

      {/* Contenido del tab activo */}
      {tabActiva === 'metodo' ? <TabMetodoCobro /> : <TabBancarios />}
    </div>
  )
}
