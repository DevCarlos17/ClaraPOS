import { useMemo, useRef, useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, ClipboardList, History, Package, Printer, RotateCcw, Search } from 'lucide-react'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useAjusteMotivosActivos } from '@/features/inventario/hooks/use-ajuste-motivos'
import { useEnsureDefaultMotivos } from '@/features/inventario/hooks/use-ensure-default-motivos'
import { crearAjuste, aplicarAjuste } from '@/features/inventario/hooks/use-ajustes'
import { AjusteList } from './ajuste-list'

interface ProductoConteo {
  id: string
  codigo: string
  nombre: string
  stock: string
  nombre_departamento: string | null
  departamento_id: string
  maneja_lotes: number
}

type OrdenCol = 'departamento' | 'nombre' | 'stock' | 'diferencia'
type OrdenDir = 'asc' | 'desc'

export function AjusteMasivo() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  useEnsureDefaultMotivos(empresaId)

  const [vista, setVista] = useState<'conteo' | 'historial'>('conteo')
  const [depositoId, setDepositoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroDepto, setFiltroDepto] = useState('')
  const [soloConCambios, setSoloConCambios] = useState(false)
  const [conteos, setConteos] = useState<Record<string, string>>({})
  const [, setConfirmando] = useState(false)
  const [motivoSumaId, setMotivoSumaId] = useState('')
  const [motivoRestaId, setMotivoRestaId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [orden, setOrden] = useState<{ col: OrdenCol; dir: OrdenDir }>({ col: 'nombre', dir: 'asc' })

  const dialogRef = useRef<HTMLDialogElement>(null)

  const { depositos } = useDepositosActivos()
  const { motivos } = useAjusteMotivosActivos()

  const { data: productosRaw, isLoading } = useQuery(
    `SELECT p.id, p.codigo, p.nombre, p.stock, p.departamento_id, p.maneja_lotes,
            d.nombre AS nombre_departamento
     FROM productos p
     LEFT JOIN departamentos d ON d.id = p.departamento_id
     WHERE p.empresa_id = ? AND p.tipo = 'P' AND p.is_active = 1
     ORDER BY d.nombre ASC, p.nombre ASC`,
    [empresaId]
  )

  const productos = (productosRaw ?? []) as ProductoConteo[]

  const deptoOpciones = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of productos) {
      if (p.departamento_id) set.set(p.departamento_id, p.nombre_departamento ?? p.departamento_id)
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [productos])

  const motivosSuma = useMemo(() => motivos.filter((m) => m.operacion_base === 'SUMA'), [motivos])
  const motivosResta = useMemo(() => motivos.filter((m) => m.operacion_base === 'RESTA'), [motivos])

  const productosFiltrados = useMemo(() => {
    let lista = productos

    if (filtroDepto && filtroDepto !== '__ALL__') {
      lista = lista.filter((p) => p.departamento_id === filtroDepto)
    }

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      lista = lista.filter(
        (p) => p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)
      )
    }

    if (soloConCambios) {
      lista = lista.filter((p) => {
        const nuevo = conteos[p.id]
        if (!nuevo || nuevo === '') return false
        const diff = parseFloat(nuevo) - parseFloat(p.stock)
        return !isNaN(diff) && Math.abs(diff) > 0.0001
      })
    }

    // Ordenar
    lista = [...lista].sort((a, b) => {
      let va: string | number, vb: string | number
      switch (orden.col) {
        case 'departamento':
          va = a.nombre_departamento ?? ''
          vb = b.nombre_departamento ?? ''
          break
        case 'stock':
          va = parseFloat(a.stock)
          vb = parseFloat(b.stock)
          break
        case 'diferencia': {
          const dA = conteos[a.id] !== undefined && conteos[a.id] !== ''
            ? parseFloat(conteos[a.id]) - parseFloat(a.stock)
            : 0
          const dB = conteos[b.id] !== undefined && conteos[b.id] !== ''
            ? parseFloat(conteos[b.id]) - parseFloat(b.stock)
            : 0
          va = dA
          vb = dB
          break
        }
        default:
          va = a.nombre
          vb = b.nombre
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return orden.dir === 'asc' ? va - vb : vb - va
      }
      return orden.dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })

    return lista
  }, [productos, filtroDepto, busqueda, soloConCambios, conteos, orden])

  const cambios = useMemo(() => {
    const sumas: Array<{ id: string; stockActual: number; stockNuevo: number }> = []
    const restas: Array<{ id: string; stockActual: number; stockNuevo: number }> = []
    for (const p of productos) {
      const val = conteos[p.id]
      if (!val || val === '') continue
      const nuevo = parseFloat(val)
      if (isNaN(nuevo)) continue
      const actual = parseFloat(p.stock)
      const diff = nuevo - actual
      if (Math.abs(diff) < 0.0001) continue
      if (diff > 0) sumas.push({ id: p.id, stockActual: actual, stockNuevo: nuevo })
      else restas.push({ id: p.id, stockActual: actual, stockNuevo: nuevo })
    }
    return { sumas, restas, total: sumas.length + restas.length }
  }, [productos, conteos])

  function handleCambioConteo(productoId: string, valor: string) {
    setConteos((prev) => ({ ...prev, [productoId]: valor }))
  }

  function handleLimpiar() {
    setConteos({})
    setSoloConCambios(false)
  }

  function handleOrden(col: OrdenCol) {
    setOrden((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )
  }

  function abrirConfirmacion() {
    if (cambios.total === 0) {
      toast.error('No hay cambios de stock para aplicar')
      return
    }
    if (!depositoId) {
      toast.error('Selecciona un deposito antes de aplicar el conteo')
      return
    }
    if (depositoId === '__ALL__') {
      toast.error('Selecciona un deposito especifico (no "Todos") para aplicar el conteo')
      return
    }
    setConfirmando(true)
    dialogRef.current?.showModal()
  }

  function cerrarConfirmacion() {
    setConfirmando(false)
    dialogRef.current?.close()
  }

  async function handleAplicarConteo() {
    if (!depositoId) {
      toast.error('Selecciona un deposito')
      return
    }
    if (cambios.sumas.length > 0 && !motivoSumaId) {
      toast.error('Selecciona un motivo para las entradas')
      return
    }
    if (cambios.restas.length > 0 && !motivoRestaId) {
      toast.error('Selecciona un motivo para las salidas')
      return
    }

    setAplicando(true)
    try {
      const fechaHoy = new Date().toISOString().slice(0, 10)
      const ajusteIds: string[] = []

      // Crear y aplicar ajuste de SUMA
      if (cambios.sumas.length > 0) {
        const lineas = cambios.sumas.map((c) => ({
          producto_id: c.id,
          deposito_id: depositoId,
          cantidad: c.stockNuevo - c.stockActual,
        }))
        const ajusteId = await crearAjuste({
          motivo_id: motivoSumaId,
          fecha: fechaHoy,
          observaciones: observaciones || 'Conteo fisico masivo',
          lineas,
          empresa_id: empresaId,
          created_by: user?.id,
        })
        ajusteIds.push(ajusteId)
        await aplicarAjuste(ajusteId, empresaId, user?.id ?? '')
      }

      // Crear y aplicar ajuste de RESTA
      if (cambios.restas.length > 0) {
        const lineas = cambios.restas.map((c) => ({
          producto_id: c.id,
          deposito_id: depositoId,
          cantidad: Math.abs(c.stockNuevo - c.stockActual),
        }))
        const ajusteId = await crearAjuste({
          motivo_id: motivoRestaId,
          fecha: fechaHoy,
          observaciones: observaciones || 'Conteo fisico masivo',
          lineas,
          empresa_id: empresaId,
          created_by: user?.id,
        })
        ajusteIds.push(ajusteId)
        await aplicarAjuste(ajusteId, empresaId, user?.id ?? '')
      }

      toast.success(
        `Conteo aplicado: ${ajusteIds.length} ajuste(s) creado(s) con ${cambios.total} productos`
      )
      cerrarConfirmacion()
      setConteos({})
      setSoloConCambios(false)
      setObservaciones('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aplicar conteo')
    } finally {
      setAplicando(false)
    }
  }

  function handleReporte() {
    const w = window.open('', '_blank')
    if (!w) return

    const depNombre = depositos.find((d) => d.id === depositoId)?.nombre ?? 'Todos'
    const filas = productosFiltrados
      .map((p) => {
        const nuevoStr = conteos[p.id]
        const actual = parseFloat(p.stock)
        const nuevo = nuevoStr !== undefined && nuevoStr !== '' ? parseFloat(nuevoStr) : null
        const diff = nuevo !== null && !isNaN(nuevo) ? nuevo - actual : null
        const diffStr = diff === null ? '' : diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)
        const diffColor = diff === null || diff === 0 ? '' : diff > 0 ? 'color:#16a34a' : 'color:#dc2626'
        return `<tr>
          <td style="font-family:monospace">${p.codigo}</td>
          <td>${p.nombre_departamento ?? '-'}</td>
          <td>${p.nombre}</td>
          <td style="text-align:right">${actual.toFixed(3)}</td>
          <td style="text-align:right">${nuevo !== null && !isNaN(nuevo) ? nuevo.toFixed(3) : '-'}</td>
          <td style="text-align:right;${diffColor}">${diffStr}</td>
        </tr>`
      })
      .join('')

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Conteo Fisico de Inventario</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p { margin: 2px 0 12px; color: #666; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e5e7eb; padding: 5px 8px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Conteo Fisico de Inventario</h1>
  <p>Deposito: ${depNombre} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-VE')}</p>
  <table>
    <thead>
      <tr>
        <th>Codigo</th>
        <th>Departamento</th>
        <th>Nombre</th>
        <th style="text-align:right">Stock Actual</th>
        <th style="text-align:right">Nuevo Stock</th>
        <th style="text-align:right">Diferencia</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body>
</html>`)
    w.document.close()
    w.print()
  }

  function ThSort({ col, label }: { col: OrdenCol; label: string }) {
    const activo = orden.col === col
    return (
      <th
        className="text-left px-4 py-3 font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
        onClick={() => handleOrden(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {activo ? (
            orden.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-30" />
          )}
        </span>
      </th>
    )
  }

  return (
    <div>
      {/* Tabs internas */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setVista('conteo')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-t-md ${
            vista === 'conteo'
              ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Conteo Fisico
        </button>
        <button
          onClick={() => setVista('historial')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-t-md ${
            vista === 'historial'
              ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <History className="h-4 w-4" />
          Historial de Ajustes
        </button>
      </div>

      {vista === 'historial' && <AjusteList ocultarNuevo />}

      {vista === 'conteo' && (
        <div className="space-y-4">
          {/* Barra de filtros */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Deposito */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Deposito</label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
              >
                <option value="">Seleccionar deposito...</option>
                <option value="__ALL__">Todos los depositos</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Departamento */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Departamento</label>
              <select
                value={filtroDepto}
                onChange={(e) => setFiltroDepto(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
              >
                <option value="">Seleccionar departamento...</option>
                <option value="__ALL__">Todos los departamentos</option>
                {deptoOpciones.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Busqueda */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-gray-600">Busqueda</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Codigo o nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="h-9 pl-8 pr-3 text-sm border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Solo con cambios */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer h-9 self-end">
              <input
                type="checkbox"
                checked={soloConCambios}
                onChange={(e) => setSoloConCambios(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Solo con cambios
            </label>

            {/* Spacer + botones */}
            <div className="flex gap-2 ml-auto self-end">
              {cambios.total > 0 && (
                <button
                  onClick={handleLimpiar}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpiar
                </button>
              )}
              <button
                onClick={handleReporte}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Reporte
              </button>
              <button
                onClick={abrirConfirmacion}
                disabled={cambios.total === 0 || !depositoId || depositoId === '__ALL__'}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Aplicar Conteo
                {cambios.total > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-xs font-bold bg-blue-500 rounded-full">
                    {cambios.total}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Resumen de cambios */}
          {cambios.total > 0 && (
            <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <span className="font-medium text-amber-800">{cambios.total} producto(s) con cambios:</span>
              {cambios.sumas.length > 0 && (
                <span className="text-green-700 font-medium">+{cambios.sumas.length} entradas</span>
              )}
              {cambios.restas.length > 0 && (
                <span className="text-red-700 font-medium">-{cambios.restas.length} salidas</span>
              )}
            </div>
          )}

          {/* Tabla */}
          {depositoId === '' || filtroDepto === '' ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-lg">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">
                {depositoId === ''
                  ? 'Selecciona un deposito para comenzar el conteo'
                  : 'Selecciona un departamento para ver los productos'}
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">
                {productos.length === 0 ? 'No hay productos de inventario' : 'No hay productos que coincidan con los filtros'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Codigo</th>
                    <ThSort col="departamento" label="Departamento" />
                    <ThSort col="nombre" label="Nombre" />
                    <ThSort col="stock" label="Stock Actual" />
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Nuevo Stock</th>
                    <ThSort col="diferencia" label="Diferencia" />
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map((p) => {
                    const actual = parseFloat(p.stock)
                    const nuevoStr = conteos[p.id] ?? ''
                    const nuevoVal = nuevoStr !== '' ? parseFloat(nuevoStr) : null
                    const diff = nuevoVal !== null && !isNaN(nuevoVal) ? nuevoVal - actual : null
                    const hayCambio = diff !== null && Math.abs(diff) > 0.0001

                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-gray-100 transition-colors ${
                          hayCambio ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {p.codigo}
                        </td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-xs">
                          {p.nombre_departamento ?? '-'}
                        </td>
                        <td className="px-4 py-2 text-gray-800">
                          <span className="flex items-center gap-1.5">
                            {p.nombre}
                            {p.maneja_lotes === 1 && (
                              <span title="Maneja lotes">
                                <Package className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 font-medium whitespace-nowrap">
                          {actual.toFixed(3)}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={nuevoStr}
                            onChange={(e) => handleCambioConteo(p.id, e.target.value)}
                            placeholder={actual.toFixed(3)}
                            className={`w-28 h-8 px-2 text-sm text-right tabular-nums border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              hayCambio
                                ? diff! > 0
                                  ? 'border-green-400 bg-green-50 focus:ring-green-500'
                                  : 'border-red-400 bg-red-50 focus:ring-red-500'
                                : 'border-gray-300'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                          {diff === null ? (
                            <span className="text-gray-300">—</span>
                          ) : Math.abs(diff) < 0.0001 ? (
                            <span className="text-gray-400 text-xs">sin cambio</span>
                          ) : diff > 0 ? (
                            <span className="font-medium text-green-700">+{diff.toFixed(3)}</span>
                          ) : (
                            <span className="font-medium text-red-700">{diff.toFixed(3)}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                {productosFiltrados.length} producto(s) mostrado(s) de {productos.length} total
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmacion */}
      <dialog
        ref={dialogRef}
        className="rounded-xl shadow-2xl border-0 p-0 backdrop:bg-black/40 w-full max-w-lg"
        onClose={cerrarConfirmacion}
      >
        <div className="flex flex-col gap-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Confirmar Conteo Fisico</h2>
            <p className="text-sm text-gray-500 mt-1">
              Se aplicaran {cambios.total} ajuste(s) de stock.
            </p>
          </div>

          {/* Resumen */}
          <div className="space-y-2">
            {cambios.sumas.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm text-green-800 font-medium">Entradas de inventario</span>
                <span className="text-sm font-bold text-green-700">{cambios.sumas.length} producto(s)</span>
              </div>
            )}
            {cambios.restas.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm text-red-800 font-medium">Salidas de inventario</span>
                <span className="text-sm font-bold text-red-700">{cambios.restas.length} producto(s)</span>
              </div>
            )}
          </div>

          {/* Motivo SUMA */}
          {cambios.sumas.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Motivo de entrada (SUMA)
                <span className="text-red-500 ml-1">*</span>
              </label>
              {motivosSuma.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  No hay motivos de tipo SUMA activos. Crea uno en "Motivos de Ajuste".
                </p>
              ) : (
                <select
                  value={motivoSumaId}
                  onChange={(e) => setMotivoSumaId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar motivo...</option>
                  {motivosSuma.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Motivo RESTA */}
          {cambios.restas.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Motivo de salida (RESTA)
                <span className="text-red-500 ml-1">*</span>
              </label>
              {motivosResta.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  No hay motivos de tipo RESTA activos. Crea uno en "Motivos de Ajuste".
                </p>
              ) : (
                <select
                  value={motivoRestaId}
                  onChange={(e) => setMotivoRestaId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar motivo...</option>
                  {motivosResta.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Observaciones */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Observaciones</label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Conteo fisico periodico Q1 2025"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Acciones */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={cerrarConfirmacion}
              disabled={aplicando}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAplicarConteo}
              disabled={
                aplicando ||
                (cambios.sumas.length > 0 && (!motivoSumaId || motivosSuma.length === 0)) ||
                (cambios.restas.length > 0 && (!motivoRestaId || motivosResta.length === 0))
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {aplicando ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Confirmar y Aplicar
                </>
              )}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
