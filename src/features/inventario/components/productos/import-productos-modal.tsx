import { useRef, useEffect, useState } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { crearProducto } from '@/features/inventario/hooks/use-productos'
import { agregarIngrediente } from '@/features/inventario/hooks/use-recetas'
import { kysely } from '@/core/db/kysely/kysely'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface ImportProductosModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  departamentos: Departamento[]
}

interface ParsedRow {
  rowNum: number
  codigo: string
  tipo: string
  nombre: string
  departamento: string
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string
  stock_minimo: string
  tipo_impuesto: string
  errors: string[]
  isValid: boolean
}

interface ParsedComponente {
  rowNum: number
  combo_codigo: string
  componente_codigo: string
  cantidad: string
  errors: string[]
  isValid: boolean
}

type Step = 'instrucciones' | 'preview' | 'procesando'

export function ImportProductosModal({
  isOpen,
  onClose,
  productos,
  departamentos,
}: ImportProductosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useCurrentUser()

  const [step, setStep] = useState<Step>('instrucciones')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [componentes, setComponentes] = useState<ParsedComponente[]>([])
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setStep('instrucciones')
      setRows([])
      setComponentes([])
      setFileName('')
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function validateRow(row: ParsedRow): string[] {
    const errors: string[] = []

    if (!row.codigo) {
      errors.push('codigo vacio')
    } else if (!/^[A-Z0-9-]+$/.test(row.codigo)) {
      errors.push('codigo invalido (solo mayusculas, numeros y guiones)')
    } else if (productos.some((p) => p.codigo === row.codigo)) {
      errors.push('codigo ya existe')
    }

    if (!['P', 'S', 'C'].includes(row.tipo)) {
      errors.push('tipo debe ser P, S o C')
    }

    if (!row.nombre || row.nombre.length < 3) {
      errors.push('nombre minimo 3 caracteres')
    }

    if (!row.departamento) {
      errors.push('departamento vacio')
    } else {
      const dep = departamentos.find((d) => d.codigo === row.departamento)
      if (!dep) errors.push('departamento no encontrado')
      else if (dep.is_active !== 1) errors.push('departamento inactivo')
    }

    const costo = parseFloat(row.costo_usd)
    if (isNaN(costo) || costo < 0) {
      errors.push('costo_usd invalido')
    }

    const venta = parseFloat(row.precio_venta_usd)
    if (isNaN(venta) || venta < 0) {
      errors.push('precio_venta_usd invalido')
    } else if (!isNaN(costo) && venta < costo) {
      errors.push('precio_venta_usd < costo_usd')
    }

    if (row.precio_mayor_usd.trim() !== '') {
      const mayor = parseFloat(row.precio_mayor_usd)
      if (isNaN(mayor) || mayor < 0) {
        errors.push('precio_mayor_usd invalido')
      } else if (!isNaN(venta) && mayor > venta) {
        errors.push('precio_mayor_usd > precio_venta_usd')
      }
    }

    if (row.tipo === 'P') {
      const stockMin = parseFloat(row.stock_minimo)
      if (isNaN(stockMin) || stockMin < 0) {
        errors.push('stock_minimo invalido')
      }
    }

    if (!['Gravable', 'Exento', 'Exonerado'].includes(row.tipo_impuesto)) {
      errors.push('tipo_impuesto debe ser Gravable, Exento o Exonerado')
    }

    return errors
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      // Hoja 1: Inventario (P, S, C)
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      if (rawRows.length === 0) {
        toast.error('El archivo esta vacio')
        return
      }

      const parsed: ParsedRow[] = rawRows.map((r, i) => {
        const row: ParsedRow = {
          rowNum: i + 2,
          codigo: String(r.codigo ?? '').trim().toUpperCase(),
          tipo: String(r.tipo ?? '').trim().toUpperCase(),
          nombre: String(r.nombre ?? '').trim().toUpperCase(),
          departamento: String(r.departamento ?? '').trim().toUpperCase(),
          costo_usd: String(r.costo_usd ?? '').trim(),
          precio_venta_usd: String(r.precio_venta_usd ?? '').trim(),
          precio_mayor_usd: String(r.precio_mayor_usd ?? '').trim(),
          stock_minimo: String(r.stock_minimo ?? '').trim(),
          tipo_impuesto: (() => {
            const raw = String(r.tipo_impuesto ?? 'Exento').trim().toLowerCase()
            if (raw === 'gravable') return 'Gravable'
            if (raw === 'exonerado') return 'Exonerado'
            return 'Exento'
          })(),
          errors: [],
          isValid: false,
        }
        row.errors = validateRow(row)
        row.isValid = row.errors.length === 0
        return row
      })

      // Detectar duplicados dentro del mismo archivo
      const codigos = new Map<string, number[]>()
      parsed.forEach((r, i) => {
        if (r.codigo) {
          const arr = codigos.get(r.codigo) ?? []
          arr.push(i)
          codigos.set(r.codigo, arr)
        }
      })
      for (const [, indices] of codigos) {
        if (indices.length > 1) {
          for (const i of indices) {
            parsed[i].errors.push('codigo duplicado en archivo')
            parsed[i].isValid = false
          }
        }
      }

      // Hoja 2: Componentes Combos (opcional)
      const parsedComponentes: ParsedComponente[] = []
      if (workbook.SheetNames.length > 1) {
        const sheet2Name = workbook.SheetNames[1]
        const sheet2 = workbook.Sheets[sheet2Name]
        const rawComp = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet2, { defval: '' })

        rawComp.forEach((r, i) => {
          const comboCod = String(r.combo_codigo ?? '').trim().toUpperCase()
          const compCod = String(r.componente_codigo ?? '').trim().toUpperCase()
          const cantStr = String(r.cantidad ?? '').trim()
          const cant = parseFloat(cantStr)

          const errors: string[] = []
          if (!comboCod) errors.push('combo_codigo vacio')
          if (!compCod) errors.push('componente_codigo vacio')
          if (isNaN(cant) || cant <= 0) errors.push('cantidad invalida')

          parsedComponentes.push({
            rowNum: i + 2,
            combo_codigo: comboCod,
            componente_codigo: compCod,
            cantidad: cantStr,
            errors,
            isValid: errors.length === 0,
          })
        })
      }

      setRows(parsed)
      setComponentes(parsedComponentes)
      setStep('preview')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error leyendo archivo'
      toast.error(`Error al leer archivo: ${msg}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleImportar() {
    if (!user?.empresa_id) {
      toast.error('No se pudo identificar la empresa')
      return
    }
    const validRows = rows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      toast.error('No hay filas validas para importar')
      return
    }

    setStep('procesando')
    let exitosos = 0
    let fallidos = 0

    // Mapa codigo → id para combos creados (para luego asignar componentes)
    const codigoToId = new Map<string, string>()

    // Paso 1: crear productos P, S, C
    for (const row of validRows) {
      try {
        const dep = departamentos.find((d) => d.codigo === row.departamento)
        if (!dep) { fallidos++; continue }

        const id = await crearProducto({
          codigo: row.codigo,
          tipo: row.tipo,
          nombre: row.nombre,
          departamento_id: dep.id,
          costo_usd: parseFloat(row.costo_usd),
          precio_venta_usd: parseFloat(row.precio_venta_usd),
          precio_mayor_usd: row.precio_mayor_usd.trim() === '' ? null : parseFloat(row.precio_mayor_usd),
          stock_minimo: row.tipo === 'S' || row.tipo === 'C' ? 0 : parseFloat(row.stock_minimo),
          empresa_id: user.empresa_id,
        })
        codigoToId.set(row.codigo, id)
        exitosos++
      } catch {
        fallidos++
      }
    }

    // Paso 2: crear componentes de combos desde hoja 2
    const validComponentes = componentes.filter((c) => c.isValid)
    if (validComponentes.length > 0) {
      // Construir mapa de todos los productos (existentes + recien creados) por codigo
      const allProductos = await kysely
        .selectFrom('productos')
        .select(['id', 'codigo'])
        .where('empresa_id', '=', user.empresa_id)
        .execute()

      const productoByCode = new Map<string, string>()
      for (const p of allProductos) productoByCode.set(p.codigo, p.id)

      let compExitosos = 0
      let compFallidos = 0
      for (const comp of validComponentes) {
        const comboId = codigoToId.get(comp.combo_codigo) ?? productoByCode.get(comp.combo_codigo)
        const componenteId = productoByCode.get(comp.componente_codigo)

        if (!comboId || !componenteId) { compFallidos++; continue }
        try {
          await agregarIngrediente(comboId, componenteId, parseFloat(comp.cantidad), user.empresa_id)
          compExitosos++
        } catch {
          compFallidos++
        }
      }
      if (compExitosos > 0) toast.success(`${compExitosos} componente(s) de combos importados`)
      if (compFallidos > 0) toast.error(`${compFallidos} componente(s) no pudieron importarse`)
    }

    if (exitosos > 0) toast.success(`${exitosos} producto(s) importado(s) correctamente`)
    if (fallidos > 0) toast.error(`${fallidos} producto(s) fallaron al importar`)
    onClose()
  }

  function handleDescargarPlantilla() {
    const wb = XLSX.utils.book_new()

    // Hoja 1: Inventario (misma estructura que la exportacion)
    const headers = [['codigo', 'tipo', 'nombre', 'departamento', 'costo_usd', 'precio_venta_usd', 'precio_mayor_usd', 'stock_minimo', 'tipo_impuesto']]
    const ejemplos = [
      ['PROD-001', 'P', 'PRODUCTO FISICO EJEMPLO', departamentos[0]?.codigo ?? 'DEP-001', '10.00', '15.00', '13.00', '5', 'Exento'],
      ['SERV-001', 'S', 'SERVICIO EJEMPLO', departamentos[0]?.codigo ?? 'DEP-001', '5.00', '20.00', '', '0', 'Exento'],
      ['COMBO-001', 'C', 'COMBO EJEMPLO', departamentos[0]?.codigo ?? 'DEP-001', '0.00', '35.00', '', '0', 'Exento'],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet([...headers, ...ejemplos])
    ws1['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Inventario')

    // Hoja 2: Componentes Combos (misma estructura que la exportacion)
    const headers2 = [['combo_codigo', 'combo_nombre', 'componente_codigo', 'componente_nombre', 'cantidad']]
    const ejemplos2 = [
      ['COMBO-001', 'COMBO EJEMPLO', 'PROD-001', 'PRODUCTO FISICO EJEMPLO', '2'],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet([...headers2, ...ejemplos2])
    ws2['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Componentes Combos')

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_inventario.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const validCount = rows.filter((r) => r.isValid).length
  const invalidCount = rows.length - validCount
  const validCompCount = componentes.filter((c) => c.isValid).length

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl max-h-[90vh]"
    >
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">
              Importar Inventario
              {step === 'preview' && (
                <span className="text-sm font-normal text-muted-foreground ml-2">- Vista previa</span>
              )}
            </h2>
            {fileName && <p className="text-xs text-muted-foreground mt-0.5">{fileName}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'instrucciones' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Formato requerido</h3>
                <p className="text-xs text-blue-700 mb-3">
                  El archivo Excel debe tener dos hojas con la misma estructura que genera el modulo de exportacion:
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-900 mb-1">Hoja 1: "Inventario" (Productos, Servicios y Combos)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs bg-white border border-blue-200 rounded">
                        <thead>
                          <tr className="bg-blue-100 border-b border-blue-200">
                            <th className="text-left px-2 py-1.5 font-semibold">Columna</th>
                            <th className="text-left px-2 py-1.5 font-semibold">Requerida</th>
                            <th className="text-left px-2 py-1.5 font-semibold">Formato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['codigo', 'Si', 'Mayusculas, numeros y guiones'],
                            ['tipo', 'Si', 'P (producto), S (servicio) o C (combo)'],
                            ['nombre', 'Si', 'Minimo 3 caracteres'],
                            ['departamento', 'Si', 'Codigo de departamento activo'],
                            ['costo_usd', 'Si', 'Numero decimal (ej: 10.50)'],
                            ['precio_venta_usd', 'Si', 'Mayor o igual al costo'],
                            ['precio_mayor_usd', 'No', 'Menor o igual al precio de venta'],
                            ['stock_minimo', 'Solo tipo P', 'Numero (ej: 5)'],
                            ['tipo_impuesto', 'No', 'Gravable, Exento o Exonerado'],
                          ].map(([col, req, fmt]) => (
                            <tr key={col} className="border-b border-blue-100">
                              <td className="px-2 py-1.5 font-mono">{col}</td>
                              <td className="px-2 py-1.5">{req}</td>
                              <td className="px-2 py-1.5">{fmt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-blue-900 mb-1">Hoja 2: "Componentes Combos" (opcional)</p>
                    <p className="text-xs text-blue-700">
                      Si existe, define los ingredientes de los combos: <code className="bg-blue-100 px-1 rounded">combo_codigo, combo_nombre, componente_codigo, componente_nombre, cantidad</code>.
                      Los productos referenciados deben existir en la hoja 1 o ya estar creados.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Notas:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Los productos importados comienzan con stock 0. Usa el Kardex para entradas posteriores.</li>
                  <li>Puedes exportar el inventario actual y re-importarlo: la estructura es identica.</li>
                  <li>El sistema detecta duplicados dentro del archivo y contra productos existentes.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDescargarPlantilla}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Descargar plantilla Excel
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex-1"
                >
                  <Upload className="h-4 w-4" />
                  Seleccionar archivo (.csv, .xlsx)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Resumen hoja 1 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-600">Total productos</p>
                  <p className="text-xl font-bold">{rows.length}</p>
                </div>
                <div className="border rounded-lg p-3 border-green-200 bg-green-50">
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Validos
                  </p>
                  <p className="text-xl font-bold text-green-700">{validCount}</p>
                </div>
                <div className="border rounded-lg p-3 border-red-200 bg-red-50">
                  <p className="text-xs text-red-700 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Con errores
                  </p>
                  <p className="text-xl font-bold text-red-700">{invalidCount}</p>
                </div>
              </div>

              {validCompCount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                  <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
                  Hoja 2 detectada: <strong>{validCompCount}</strong> componente(s) de combos validos para importar.
                </div>
              )}

              {invalidCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  Solo se importaran las filas validas. Corrige los errores en tu archivo y vuelve a cargarlo.
                </div>
              )}

              {/* Tabla de preview */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[40vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-2 py-2 font-medium">#</th>
                        <th className="text-left px-2 py-2 font-medium">Estado</th>
                        <th className="text-left px-2 py-2 font-medium">Codigo</th>
                        <th className="text-left px-2 py-2 font-medium">Tipo</th>
                        <th className="text-left px-2 py-2 font-medium">Nombre</th>
                        <th className="text-left px-2 py-2 font-medium">Depto</th>
                        <th className="text-right px-2 py-2 font-medium">Costo</th>
                        <th className="text-right px-2 py-2 font-medium">Venta</th>
                        <th className="text-left px-2 py-2 font-medium">Errores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rowNum} className={`border-b border-gray-100 ${row.isValid ? '' : 'bg-red-50'}`}>
                          <td className="px-2 py-1.5 text-gray-500">{row.rowNum}</td>
                          <td className="px-2 py-1.5">
                            {row.isValid
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              : <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{row.codigo}</td>
                          <td className="px-2 py-1.5">{row.tipo}</td>
                          <td className="px-2 py-1.5 truncate max-w-[140px]">{row.nombre}</td>
                          <td className="px-2 py-1.5">{row.departamento}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.costo_usd}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.precio_venta_usd}</td>
                          <td className="px-2 py-1.5 text-red-600">{row.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'procesando' && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-700">Importando productos...</p>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="flex justify-end gap-3 p-4 border-t shrink-0">
            <button
              onClick={() => setStep('instrucciones')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cargar otro archivo
            </button>
            <button
              onClick={handleImportar}
              disabled={validCount === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Importar {validCount} producto(s)
              {validCompCount > 0 ? ` + ${validCompCount} componente(s)` : ''}
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
