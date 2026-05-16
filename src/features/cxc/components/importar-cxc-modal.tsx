import { useState, useRef } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { parseCsv } from '@/lib/csv-parser'
import {
  cxcImportRowSchema,
  CXC_CSV_HEADER_MAP,
  type CxcImportRow,
  type CxcImportRowResult,
} from '../schemas/cxc-import-schema'
import {
  importarSaldosInicialesCxc,
  generarPlantillaCxcCsv,
} from '../hooks/use-importar-cxc'
import {
  UploadSimple,
  FileArrowDown,
  CheckCircle,
  XCircle,
  Warning,
} from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'

// ─── Tipos internos ─────────────────────────────────────────────

type Step = 'instrucciones' | 'revision' | 'importando' | 'resultado'

interface FilaPreview {
  numero: number
  raw: CxcImportRow | null
  erroresValidacion: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

// ─── Componente ──────────────────────────────────────────────────

export function ImportarCxcModal({ isOpen, onClose }: Props) {
  const { user } = useCurrentUser()
  const { depositos } = useDepositosActivos()

  const [step, setStep] = useState<Step>('instrucciones')
  const [depositoId, setDepositoId] = useState('')
  const [filas, setFilas] = useState<FilaPreview[]>([])
  const [progreso, setProgreso] = useState({ procesadas: 0, total: 0 })
  const [resultados, setResultados] = useState<{
    exitosos: number
    fallidos: Extract<CxcImportRowResult, { ok: false }>[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    if (step === 'importando') return
    setStep('instrucciones')
    setDepositoId('')
    setFilas([])
    setProgreso({ procesadas: 0, total: 0 })
    setResultados(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // ─── Descargar plantilla ─────────────────────────────────────

  function handleDescargarPlantilla() {
    const csv = generarPlantillaCxcCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cxc_plantilla_importacion.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Procesar archivo ─────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target?.result as string
      procesarCsv(raw)
    }
    reader.readAsText(file, 'utf-8')
  }

  function procesarCsv(raw: string) {
    const { rows: rawRows, parseErrors } = parseCsv<Record<string, string>>(raw, CXC_CSV_HEADER_MAP)

    if (parseErrors.length > 0 && rawRows.length === 0) {
      toast.error(parseErrors[0].message)
      return
    }

    const preview: FilaPreview[] = rawRows.map((row, i) => {
      const parsed = cxcImportRowSchema.safeParse(row)
      if (parsed.success) {
        return { numero: i + 1, raw: parsed.data, erroresValidacion: [] }
      }
      const errores = parsed.error.issues.map((e) => e.message)
      return { numero: i + 1, raw: null, erroresValidacion: errores }
    })

    setFilas(preview)
    setStep('revision')
  }

  // ─── Importar ─────────────────────────────────────────────────

  async function handleImportar() {
    if (!user?.empresa_id || !user.id) return
    if (!depositoId) {
      toast.error('Seleccione un deposito antes de importar')
      return
    }

    const filasValidas = filas
      .filter((f) => f.raw !== null)
      .map((f) => f.raw as CxcImportRow)

    if (filasValidas.length === 0) {
      toast.error('No hay filas validas para importar')
      return
    }

    setStep('importando')
    setProgreso({ procesadas: 0, total: filasValidas.length })

    try {
      const summary = await importarSaldosInicialesCxc({
        filas: filasValidas,
        depositoId,
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
          <DialogTitle>Importar Saldos Iniciales — Cuentas por Cobrar</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* ── PASO: instrucciones ── */}
          {step === 'instrucciones' && (
            <div className="space-y-5">
              {/* Seleccionar deposito */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Deposito *</label>
                <NativeSelect
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value)}
                >
                  <option value="">Seleccionar deposito...</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}{d.es_principal === 1 ? ' (Principal)' : ''}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  Se aplicara a todos los registros del lote.
                </p>
              </div>

              {/* Instrucciones */}
              <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Formato del archivo CSV</p>
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
                        ['identificacion', 'Si', 'Cedula o RIF del cliente (debe existir en el sistema)'],
                        ['nro_documento', 'Si', 'Numero de factura del sistema anterior'],
                        ['fecha', 'Si', 'Fecha en formato YYYY-MM-DD (ej: 2024-01-15)'],
                        ['monto_usd', 'Si', 'Monto del saldo en USD (ej: 250.00)'],
                        ['tasa', 'No', 'Tasa Bs/USD. Si se omite, usa la ultima tasa registrada'],
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
                  El numero de documento original se guardara como referencia. ClaraPOS generara
                  su propio numero de factura (SI-000001, SI-000002...).
                </p>
              </div>

              {/* Descargar plantilla */}
              <Button variant="outline" className="w-full" onClick={handleDescargarPlantilla}>
                <FileArrowDown className="h-4 w-4 mr-2" />
                Descargar Plantilla CSV
              </Button>

              {/* Subir archivo */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subir archivo CSV</label>
                <label
                  className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    depositoId
                      ? 'border-border hover:border-primary/50 hover:bg-muted/50'
                      : 'border-border/40 bg-muted/20 cursor-not-allowed opacity-60'
                  }`}
                >
                  <UploadSimple className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">
                    {depositoId ? 'Click para seleccionar archivo .csv' : 'Seleccione un deposito primero'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    disabled={!depositoId}
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
                        <th className="px-3 py-2 text-left font-medium">Identificacion</th>
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
                            {fila.raw?.identificacion ?? '—'}
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
