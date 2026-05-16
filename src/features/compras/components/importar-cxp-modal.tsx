import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { parseCsv, type CsvParseResult } from '@/lib/csv-parser'
import { parseExcel } from '@/lib/excel-parser'
import {
  cxpImportRowSchema,
  CXP_CSV_HEADER_MAP,
  type CxpImportRow,
  type CxpImportRowResult,
} from '../schemas/cxp-import-schema'
import { importarSaldosInicialesCxp } from '../hooks/use-importar-cxp'
import {
  UploadSimple,
  FileArrowDown,
  CheckCircle,
  XCircle,
  Warning,
  Info,
} from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'

const MAX_FILAS = 500

// ─── Tipos internos ─────────────────────────────────────────────

type Step = 'instrucciones' | 'revision' | 'importando' | 'resultado'

interface FilaPreview {
  numero: number
  raw: CxpImportRow | null
  erroresValidacion: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

// ─── Pre-validacion de existencia (fuera del componente) ─────────

async function prevalidarProveedores(
  rifs: string[],
  empresaId: string
): Promise<Set<string>> {
  if (rifs.length === 0) return new Set()
  const placeholders = rifs.map(() => '?').join(', ')
  const result = await db.execute(
    `SELECT rif FROM proveedores WHERE empresa_id = ? AND is_active = 1 AND rif IN (${placeholders})`,
    [empresaId, ...rifs]
  )
  const encontrados = new Set<string>()
  for (let i = 0; i < (result.rows?.length ?? 0); i++) {
    encontrados.add((result.rows!.item(i) as { rif: string }).rif)
  }
  return encontrados
}

// ─── Componente ──────────────────────────────────────────────────

export function ImportarCxpModal({ isOpen, onClose }: Props) {
  const { user } = useCurrentUser()

  const [step, setStep] = useState<Step>('instrucciones')
  const [filas, setFilas] = useState<FilaPreview[]>([])
  const [progreso, setProgreso] = useState({ procesadas: 0, total: 0 })
  const [resultados, setResultados] = useState<{
    exitosos: number
    fallidos: Extract<CxpImportRowResult, { ok: false }>[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    if (step === 'importando') return
    setStep('instrucciones')
    setFilas([])
    setProgreso({ procesadas: 0, total: 0 })
    setResultados(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // ─── Descargar plantilla Excel ────────────────────────────────

  function handleDescargarPlantilla() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['rif', 'nro_documento', 'fecha', 'monto_usd', 'tasa', 'descripcion'],
      ['J-12345678-9', 'FAC-PROV-001', '2024-01-15', '500.00', '36.50', 'Deuda proveedor'],
      ['V-87654321-0', 'FACT-2024-100', '2024-02-01', '1200.00', '', 'Saldo sistema anterior'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Importacion')
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cxp_plantilla_importacion.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Procesar filas (CSV o Excel) ────────────────────────────

  async function procesarFilas({
    rows: rawRows,
    parseErrors,
  }: CsvParseResult<Record<string, string>>) {
    if (parseErrors.length > 0 && rawRows.length === 0) {
      toast.error(parseErrors[0].message)
      return
    }

    if (rawRows.length > MAX_FILAS) {
      toast.error(
        `El archivo supera el limite de ${MAX_FILAS} filas. Divida en lotes de maximo ${MAX_FILAS} registros.`
      )
      return
    }

    // Primera pasada: validacion Zod campo por campo
    const preview: FilaPreview[] = rawRows.map((row, i) => {
      const parsed = cxpImportRowSchema.safeParse(row)
      if (parsed.success) {
        return { numero: i + 1, raw: parsed.data, erroresValidacion: [] }
      }
      const errores = parsed.error.issues.map((e) => e.message)
      return { numero: i + 1, raw: null, erroresValidacion: errores }
    })

    // Segunda pasada: verificar existencia de proveedores en la BD local
    const empresaId = user?.empresa_id
    if (empresaId) {
      const filasValidas = preview.filter((f) => f.raw !== null)
      if (filasValidas.length > 0) {
        const unicosRif = [...new Set(filasValidas.map((f) => f.raw!.rif))]
        try {
          const encontrados = await prevalidarProveedores(unicosRif, empresaId)
          for (const fila of preview) {
            if (fila.raw !== null && !encontrados.has(fila.raw.rif)) {
              fila.erroresValidacion = [
                `Proveedor no encontrado en el sistema: "${fila.raw.rif}"`,
              ]
              fila.raw = null
            }
          }
        } catch {
          // Si falla la consulta, continuar; los errores aparecen en el resultado final
        }
      }
    }

    setFilas(preview)
    setStep('revision')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      parseExcel<Record<string, string>>(file, CXP_CSV_HEADER_MAP)
        .then((result) => procesarFilas(result))
        .catch(() => toast.error('Error al leer el archivo Excel'))
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseCsv<Record<string, string>>(
        ev.target?.result as string,
        CXP_CSV_HEADER_MAP
      )
      void procesarFilas(result)
    }
    reader.readAsText(file, 'utf-8')
  }

  // ─── Importar ─────────────────────────────────────────────────

  async function handleImportar() {
    if (!user?.empresa_id || !user.id) return

    const filasValidas = filas
      .filter((f) => f.raw !== null)
      .map((f) => f.raw as CxpImportRow)

    if (filasValidas.length === 0) {
      toast.error('No hay filas validas para importar')
      return
    }

    setStep('importando')
    setProgreso({ procesadas: 0, total: filasValidas.length })

    try {
      const summary = await importarSaldosInicialesCxp({
        filas: filasValidas,
        empresaId: user.empresa_id,
        usuarioId: user.id,
        onProgress: (procesadas, total) => setProgreso({ procesadas, total }),
      })

      setResultados(summary)
      setStep('resultado')

      if (summary.exitosos > 0) {
        toast.success(`${summary.exitosos} saldo(s) importado(s) exitosamente`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error durante la importacion')
      setStep('revision')
    }
  }

  // ─── Contadores ───────────────────────────────────────────────

  const filasValidas = filas.filter((f) => f.raw !== null).length
  const filasConError = filas.filter((f) => f.raw === null).length
  const porcentaje =
    progreso.total > 0 ? Math.round((progreso.procesadas / progreso.total) * 100) : 0

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Saldos Iniciales — Cuentas por Pagar</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* ── PASO: instrucciones ── */}
          {step === 'instrucciones' && (
            <div className="space-y-4">

              {/* Aviso decimal */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Separador decimal: punto (.)</strong>
                  {' '}— Correcto: <code className="font-mono">500.00</code>
                  {' '}| Incorrecto: <code className="font-mono">500,00</code>
                </span>
              </div>

              {/* Tabla de columnas */}
              <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Formato del archivo (CSV o Excel)</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border px-2 py-1 text-left">Columna</th>
                        <th className="border border-border px-2 py-1 text-left">Requerido</th>
                        <th className="border border-border px-2 py-1 text-left">Descripcion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['rif', 'Si', 'RIF del proveedor — solo letras, numeros y guiones (ej: J-12345678-9)'],
                        ['nro_documento', 'Si', 'Numero de factura del sistema anterior — solo letras, numeros, guiones, barras y puntos'],
                        ['fecha', 'Si', 'Formato YYYY-MM-DD (ej: 2024-01-15) — no se permiten fechas futuras'],
                        ['monto_usd', 'Si', 'Monto en USD con punto decimal (ej: 500.00)'],
                        ['tasa', 'No', 'Tasa Bs/USD con punto decimal (ej: 36.50). Si se omite, usa la ultima registrada'],
                        ['descripcion', 'No', 'Observacion libre'],
                      ].map(([col, req, desc]) => (
                        <tr key={col}>
                          <td className="border border-border px-2 py-1 font-mono">{col}</td>
                          <td className="border border-border px-2 py-1">{req}</td>
                          <td className="border border-border px-2 py-1 text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximo {MAX_FILAS} filas por lote. El numero de documento original se guardara como
                  referencia. ClaraPOS generara su propio numero de factura (SIP-000001, SIP-000002...).
                </p>
              </div>

              {/* Descargar plantilla */}
              <Button variant="outline" className="w-full" onClick={handleDescargarPlantilla}>
                <FileArrowDown className="h-4 w-4 mr-2" />
                Descargar Plantilla Excel
              </Button>

              {/* Subir archivo */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subir archivo (CSV o Excel)</label>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-border hover:border-primary/50 hover:bg-muted/50">
                  <UploadSimple className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">
                    Click para seleccionar archivo .csv o .xlsx
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ── PASO: revision ── */}
          {step === 'revision' && (
            <div className="space-y-4">
              {/* Contador */}
              <div className="flex items-center gap-3 text-sm">
                {filasValidas > 0 && (
                  <span className="flex items-center gap-1 text-green-700 font-medium">
                    <CheckCircle className="h-4 w-4" />
                    {filasValidas} listo{filasValidas !== 1 ? 's' : ''}
                  </span>
                )}
                {filasConError > 0 && (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    {filasConError} con error{filasConError !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>

              {filasConError > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <Warning className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Las filas con errores no se importaran. Solo se procesaran las filas validas.</span>
                </div>
              )}

              {/* Tabla de preview */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">RIF</th>
                        <th className="px-3 py-2 text-left font-medium">Documento</th>
                        <th className="px-3 py-2 text-left font-medium">Fecha</th>
                        <th className="px-3 py-2 text-right font-medium">Monto USD</th>
                        <th className="px-3 py-2 text-center font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila) => (
                        <tr
                          key={fila.numero}
                          className={fila.raw ? '' : 'bg-destructive/5'}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">{fila.numero}</td>
                          <td className="px-3 py-1.5 font-mono">
                            {fila.raw?.rif ?? '—'}
                          </td>
                          <td className="px-3 py-1.5">{fila.raw?.nro_documento ?? '—'}</td>
                          <td className="px-3 py-1.5">{fila.raw?.fecha ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {fila.raw ? formatUsd(fila.raw.monto_usd) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {fila.raw ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Listo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <XCircle className="h-3.5 w-3.5" />
                                {fila.erroresValidacion[0] ?? 'Error'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total a importar */}
              {filasValidas > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between">
                  <span className="text-muted-foreground">Total a importar:</span>
                  <span className="font-semibold">
                    {formatUsd(
                      filas
                        .filter((f) => f.raw)
                        .reduce((s, f) => s + (f.raw?.monto_usd ?? 0), 0)
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── PASO: importando ── */}
          {step === 'importando' && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-center text-muted-foreground">
                Importando saldos iniciales...
              </p>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-200"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <p className="text-sm text-center tabular-nums">
                {progreso.procesadas} / {progreso.total} registros
              </p>
            </div>
          )}

          {/* ── PASO: resultado ── */}
          {step === 'resultado' && resultados && (
            <div className="space-y-4">
              <div
                className={`flex items-center gap-3 p-4 rounded-lg border ${
                  resultados.exitosos > 0
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                {resultados.exitosos > 0 ? (
                  <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
                ) : (
                  <Warning className="h-6 w-6 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {resultados.exitosos} saldo{resultados.exitosos !== 1 ? 's' : ''} importado{resultados.exitosos !== 1 ? 's' : ''} exitosamente
                  </p>
                  {resultados.fallidos.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {resultados.fallidos.length} fila{resultados.fallidos.length !== 1 ? 's' : ''} no pudieron importarse
                    </p>
                  )}
                </div>
              </div>

              {resultados.fallidos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">Filas con error:</p>
                  <div className="rounded-lg border border-destructive/20 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      <table className="text-xs w-full">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Fila</th>
                            <th className="px-3 py-2 text-left font-medium">Documento</th>
                            <th className="px-3 py-2 text-left font-medium">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultados.fallidos.map((f) => (
                            <tr key={f.fila} className="border-t border-border/50">
                              <td className="px-3 py-1.5 text-muted-foreground">{f.fila}</td>
                              <td className="px-3 py-1.5 font-mono">{f.nro_documento}</td>
                              <td className="px-3 py-1.5 text-destructive">{f.errores[0]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer de acciones ── */}
        <div className="flex justify-between gap-2 pt-4 border-t border-border mt-auto">
          {step === 'instrucciones' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <span />
            </>
          )}

          {step === 'revision' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('instrucciones')
                  setFilas([])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                Volver
              </Button>
              <Button
                onClick={handleImportar}
                disabled={filasValidas === 0}
              >
                <UploadSimple className="h-4 w-4 mr-2" />
                Importar {filasValidas} registro{filasValidas !== 1 ? 's' : ''}
              </Button>
            </>
          )}

          {step === 'importando' && (
            <span className="text-sm text-muted-foreground">Procesando, no cerrar esta ventana...</span>
          )}

          {step === 'resultado' && (
            <Button className="ml-auto" onClick={handleClose}>
              Cerrar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
