import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  crearCuenta,
  type CuentaContable,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import {
  downloadCsv,
  generateTemplate,
  parseCsv,
  type ParsedCuentaRow,
} from '@/features/contabilidad/lib/plan-cuentas-csv'
import type { TipoCuenta, NaturalezaCuenta } from '@/features/contabilidad/schemas/cuenta-schema'

// ─── Props ────────────────────────────────────────────────────

interface PlanCuentasImportProps {
  isOpen: boolean
  onClose: () => void
  cuentas: CuentaContable[]
  empresaId: string
  userId: string
}

// ─── Componente ───────────────────────────────────────────────

export function PlanCuentasImport({
  isOpen,
  onClose,
  cuentas,
  empresaId,
  userId,
}: PlanCuentasImportProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [parsedRows, setParsedRows] = useState<ParsedCuentaRow[]>([])
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')

  // Abrir / cerrar dialog nativo
  useEffect(() => {
    if (isOpen) {
      setParsedRows([])
      setFileName('')
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  function handleDescargarPlantilla() {
    downloadCsv(generateTemplate(), 'plantilla_plan_cuentas.csv')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text !== 'string') return
      const rows = parseCsv(text, cuentas)
      setParsedRows(rows)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // Construye un mapa codigo->cuenta para resolver parent_codigo a parent_id
  function resolveParentId(parentCodigo: string): string | undefined {
    if (!parentCodigo) return undefined
    return cuentas.find((c) => c.codigo === parentCodigo)?.id
  }

  function resolveNivel(parentCodigo: string): number {
    if (!parentCodigo) return 1
    const parent = cuentas.find((c) => c.codigo === parentCodigo)
    return parent ? parent.nivel + 1 : 1
  }

  async function handleImportar() {
    const validRows = parsedRows.filter((r) => !r.error)
    if (validRows.length === 0) return

    setImporting(true)
    let creadas = 0
    let errores = 0

    for (const row of validRows) {
      try {
        await crearCuenta({
          codigo: row.codigo,
          nombre: row.nombre,
          tipo: row.tipo as TipoCuenta,
          naturaleza: row.naturaleza as NaturalezaCuenta,
          parent_id: resolveParentId(row.parent_codigo),
          nivel: resolveNivel(row.parent_codigo),
          es_cuenta_detalle: row.es_cuenta_detalle,
          empresa_id: empresaId,
          created_by: userId,
        })
        creadas++
      } catch {
        errores++
      }
    }

    setImporting(false)

    if (errores === 0) {
      toast.success(`${creadas} cuenta(s) creada(s) correctamente`)
    } else {
      toast.warning(`${creadas} creada(s), ${errores} con errores`)
    }

    onClose()
  }

  const validRows = parsedRows.filter((r) => !r.error)
  const errorRows = parsedRows.filter((r) => !!r.error)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
    >
      <div className="p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Importar Plan de Cuentas</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Formato del archivo CSV</p>
          <p className="mb-2">
            El archivo debe tener las siguientes columnas en orden:
          </p>
          <code className="block bg-white border border-blue-200 rounded px-3 py-1.5 text-xs font-mono">
            codigo, nombre, tipo, naturaleza, es_cuenta_detalle, parent_codigo
          </code>
          <ul className="mt-2 space-y-0.5 list-disc list-inside text-xs">
            <li><strong>tipo</strong>: ACTIVO, PASIVO, PATRIMONIO, INGRESO, COSTO o GASTO</li>
            <li><strong>naturaleza</strong>: DEUDORA o ACREEDORA</li>
            <li><strong>es_cuenta_detalle</strong>: SI o NO</li>
            <li><strong>parent_codigo</strong>: codigo de la cuenta padre (dejar vacio si es raiz)</li>
          </ul>
        </div>

        {/* Acciones de archivo */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleDescargarPlantilla}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Download className="h-4 w-4" />
            Descargar Plantilla
          </button>

          <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors cursor-pointer">
            <Upload className="h-4 w-4" />
            {fileName || 'Seleccionar archivo CSV'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {parsedRows.length > 0 && (
            <span className="text-sm text-gray-500">
              {parsedRows.length} fila(s) leida(s) — {validRows.length} valida(s), {errorRows.length} con error
            </span>
          )}
        </div>

        {/* Tabla de vista previa */}
        {parsedRows.length > 0 && (
          <div className="flex-1 overflow-auto border border-gray-200 rounded-lg min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 sticky top-0">
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Codigo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Nombre</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Naturaleza</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Detalle</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Padre</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Error</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 ${row.error ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-3 py-2 font-mono text-gray-900">{row.codigo}</td>
                    <td className="px-3 py-2 text-gray-900">{row.nombre}</td>
                    <td className="px-3 py-2 text-gray-700">{row.tipo}</td>
                    <td className="px-3 py-2 text-gray-700">{row.naturaleza}</td>
                    <td className="px-3 py-2 text-gray-700">{row.es_cuenta_detalle ? 'SI' : 'NO'}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{row.parent_codigo || '—'}</td>
                    <td className="px-3 py-2 text-red-600 text-xs">{row.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImportar}
            disabled={validRows.length === 0 || importing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {importing
              ? 'Importando...'
              : `Importar ${validRows.length > 0 ? `(${validRows.length})` : ''}`}
          </button>
        </div>
      </div>
    </dialog>
  )
}
