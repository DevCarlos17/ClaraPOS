import { useRef, useEffect, useState } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { crearProducto } from '@/features/inventario/hooks/use-productos'
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
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setStep('instrucciones')
      setRows([])
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

    // Codigo
    if (!row.codigo) {
      errors.push('codigo vacio')
    } else if (!/^[A-Z0-9-]+$/.test(row.codigo)) {
      errors.push('codigo invalido (solo mayusculas, numeros y guiones)')
    } else if (productos.some((p) => p.codigo === row.codigo)) {
      errors.push('codigo ya existe')
    }

    // Tipo
    if (!['P', 'S'].includes(row.tipo)) {
      errors.push('tipo debe ser P o S')
    }

    // Nombre
    if (!row.nombre || row.nombre.length < 3) {
      errors.push('nombre minimo 3 caracteres')
    }

    // Departamento
    if (!row.departamento) {
      errors.push('departamento vacio')
    } else {
      const dep = departamentos.find((d) => d.codigo === row.departamento)
      if (!dep) errors.push('departamento no encontrado')
      else if (dep.is_active !== 1) errors.push('departamento inactivo')
    }

    // Costo
    const costo = parseFloat(row.costo_usd)
    if (isNaN(costo) || costo < 0) {
      errors.push('costo_usd invalido')
    }

    // Precio venta
    const venta = parseFloat(row.precio_venta_usd)
    if (isNaN(venta) || venta < 0) {
      errors.push('precio_venta_usd invalido')
    } else if (!isNaN(costo) && venta < costo) {
      errors.push('precio_venta_usd < costo_usd')
    }

    // Precio mayor (opcional)
    if (row.precio_mayor_usd.trim() !== '') {
      const mayor = parseFloat(row.precio_mayor_usd)
      if (isNaN(mayor) || mayor < 0) {
        errors.push('precio_mayor_usd invalido')
      } else if (!isNaN(venta) && mayor > venta) {
        errors.push('precio_mayor_usd > precio_venta_usd')
      }
    }

    // Stock minimo (solo productos)
    if (row.tipo === 'P') {
      const stockMin = parseFloat(row.stock_minimo)
      if (isNaN(stockMin) || stockMin < 0) {
        errors.push('stock_minimo invalido')
      }
    }

    // Tipo impuesto
    if (!['GRAVABLE', 'EXENTO', 'EXONERADO'].includes(row.tipo_impuesto)) {
      errors.push('tipo_impuesto debe ser GRAVABLE, EXENTO o EXONERADO')
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
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      })

      if (rawRows.length === 0) {
        toast.error('El archivo esta vacio')
        return
      }

      const parsed: ParsedRow[] = rawRows.map((r, i) => {
        const row: ParsedRow = {
          rowNum: i + 2, // +2 porque fila 1 es header y contamos desde 1
          codigo: String(r.codigo ?? '').trim().toUpperCase(),
          tipo: String(r.tipo ?? '').trim().toUpperCase(),
          nombre: String(r.nombre ?? '').trim().toUpperCase(),
          departamento: String(r.departamento ?? '').trim().toUpperCase(),
          costo_usd: String(r.costo_usd ?? '').trim(),
          precio_venta_usd: String(r.precio_venta_usd ?? '').trim(),
          precio_mayor_usd: String(r.precio_mayor_usd ?? '').trim(),
          stock_minimo: String(r.stock_minimo ?? '').trim(),
          tipo_impuesto: String(r.tipo_impuesto ?? 'EXENTO').trim().toUpperCase(),
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

      setRows(parsed)
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

    for (const row of validRows) {
      try {
        const dep = departamentos.find((d) => d.codigo === row.departamento)
        if (!dep) {
          fallidos++
          continue
        }
        await crearProducto({
          codigo: row.codigo,
          tipo: row.tipo,
          nombre: row.nombre,
          departamento_id: dep.id,
          costo_usd: parseFloat(row.costo_usd),
          precio_venta_usd: parseFloat(row.precio_venta_usd),
          precio_mayor_usd:
            row.precio_mayor_usd.trim() === ''
              ? null
              : parseFloat(row.precio_mayor_usd),
          stock_minimo: row.tipo === 'S' ? 0 : parseFloat(row.stock_minimo),
          empresa_id: user.empresa_id,
        })
        exitosos++
      } catch {
        fallidos++
      }
    }

    if (exitosos > 0) {
      toast.success(`${exitosos} producto(s) importado(s) correctamente`)
    }
    if (fallidos > 0) {
      toast.error(`${fallidos} producto(s) fallaron al importar`)
    }
    onClose()
  }

  function handleDescargarPlantilla() {
    const headers = [
      [
        'codigo',
        'tipo',
        'nombre',
        'departamento',
        'costo_usd',
        'precio_venta_usd',
        'precio_mayor_usd',
        'stock_minimo',
        'tipo_impuesto',
      ],
    ]
    const ejemplo = [
      [
        'PROD-001',
        'P',
        'PRODUCTO EJEMPLO',
        departamentos[0]?.codigo ?? 'DEP-001',
        '10.00',
        '15.00',
        '13.00',
        '5',
        'EXENTO',
      ],
    ]
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...ejemplo])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
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
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  - Vista previa
                </span>
              )}
            </h2>
            {fileName && (
              <p className="text-xs text-muted-foreground mt-0.5">{fileName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'instrucciones' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Formato requerido
                </h3>
                <p className="text-xs text-blue-700 mb-3">
                  El archivo (CSV o Excel) debe contener las siguientes columnas en
                  la primera fila, respetando el orden y los nombres exactos:
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs bg-white border border-blue-200 rounded">
                    <thead>
                      <tr className="bg-blue-100 border-b border-blue-200">
                        <th className="text-left px-2 py-1.5 font-semibold">
                          Columna
                        </th>
                        <th className="text-left px-2 py-1.5 font-semibold">
                          Requerida
                        </th>
                        <th className="text-left px-2 py-1.5 font-semibold">
                          Formato
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">codigo</td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">
                          Mayusculas, numeros y guiones. Debe ser unico.
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">tipo</td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">
                          P (producto) o S (servicio)
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">nombre</td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">Minimo 3 caracteres</td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">departamento</td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">
                          Codigo de un departamento activo existente
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">costo_usd</td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">
                          Numero decimal (ej: 10.50)
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">
                          precio_venta_usd
                        </td>
                        <td className="px-2 py-1.5">Si</td>
                        <td className="px-2 py-1.5">
                          Debe ser mayor o igual al costo
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">
                          precio_mayor_usd
                        </td>
                        <td className="px-2 py-1.5">No</td>
                        <td className="px-2 py-1.5">
                          Debe ser menor o igual al precio de venta
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100">
                        <td className="px-2 py-1.5 font-mono">stock_minimo</td>
                        <td className="px-2 py-1.5">Solo tipo P</td>
                        <td className="px-2 py-1.5">Numero (ej: 5)</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 font-mono">tipo_impuesto</td>
                        <td className="px-2 py-1.5">No</td>
                        <td className="px-2 py-1.5">GRAVABLE, EXENTO o EXONERADO (por defecto: EXENTO)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Notas importantes:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>
                    Los nuevos productos se crean con stock inicial en 0. Usa el
                    Kardex para registrar entradas posteriores.
                  </li>
                  <li>
                    El sistema detecta y marca duplicados dentro del archivo y
                    contra productos existentes.
                  </li>
                  <li>
                    Antes de procesar, veras una vista previa con errores
                    detallados para corregir.
                  </li>
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
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-600">Total filas</p>
                  <p className="text-xl font-bold">{rows.length}</p>
                </div>
                <div className="border rounded-lg p-3 border-green-200 bg-green-50">
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Validas
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

              {invalidCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  Solo se importaran las filas validas. Corrige los errores en tu
                  archivo y vuelve a cargarlo si quieres incluir las otras.
                </div>
              )}

              {/* Tabla de preview */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[40vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-2 py-2 font-medium">#</th>
                        <th className="text-left px-2 py-2 font-medium">
                          Estado
                        </th>
                        <th className="text-left px-2 py-2 font-medium">
                          Codigo
                        </th>
                        <th className="text-left px-2 py-2 font-medium">Tipo</th>
                        <th className="text-left px-2 py-2 font-medium">
                          Nombre
                        </th>
                        <th className="text-left px-2 py-2 font-medium">Depto</th>
                        <th className="text-right px-2 py-2 font-medium">
                          Costo
                        </th>
                        <th className="text-right px-2 py-2 font-medium">
                          Venta
                        </th>
                        <th className="text-left px-2 py-2 font-medium">
                          Errores
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.rowNum}
                          className={`border-b border-gray-100 ${
                            row.isValid ? '' : 'bg-red-50'
                          }`}
                        >
                          <td className="px-2 py-1.5 text-gray-500">
                            {row.rowNum}
                          </td>
                          <td className="px-2 py-1.5">
                            {row.isValid ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{row.codigo}</td>
                          <td className="px-2 py-1.5">{row.tipo}</td>
                          <td className="px-2 py-1.5 truncate max-w-[140px]">
                            {row.nombre}
                          </td>
                          <td className="px-2 py-1.5">{row.departamento}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {row.costo_usd}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {row.precio_venta_usd}
                          </td>
                          <td className="px-2 py-1.5 text-red-600">
                            {row.errors.join('; ')}
                          </td>
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

        {/* Footer */}
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
              Importar {validCount} fila(s) valida(s)
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
