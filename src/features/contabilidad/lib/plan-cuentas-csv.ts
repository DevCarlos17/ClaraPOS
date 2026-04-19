import type { CuentaContable } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { cuentaSchema } from '@/features/contabilidad/schemas/cuenta-schema'

// ─── Constantes ──────────────────────────────────────────────

const CSV_HEADERS = ['codigo', 'nombre', 'tipo', 'naturaleza', 'es_cuenta_detalle', 'parent_codigo']

// ─── Exportar CSV ────────────────────────────────────────────

/**
 * Serializa el plan de cuentas completo a formato CSV.
 * La columna parent_codigo resuelve el parent_id a su codigo legible.
 */
export function exportPlanCuentasCsv(cuentas: CuentaContable[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const c of cuentas) {
    const parent = cuentas.find((p) => p.id === c.parent_id)
    const row = [
      c.codigo,
      `"${c.nombre.replace(/"/g, '""')}"`,
      c.tipo,
      c.naturaleza,
      c.es_cuenta_detalle === 1 ? 'SI' : 'NO',
      parent?.codigo ?? '',
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}

// ─── Descargar CSV ───────────────────────────────────────────

/**
 * Dispara la descarga de un archivo CSV en el navegador.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Plantilla CSV ───────────────────────────────────────────

/**
 * Genera una plantilla CSV de ejemplo con tres filas ilustrativas.
 */
export function generateTemplate(): string {
  const lines = [
    CSV_HEADERS.join(','),
    '6,GASTOS DE OPERACION,GASTO,DEUDORA,NO,',
    '6.1,GASTOS ADMINISTRATIVOS,GASTO,DEUDORA,NO,6',
    '6.1.01,SUELDOS Y SALARIOS,GASTO,DEUDORA,SI,6.1',
  ]
  return lines.join('\n')
}

// ─── Parsear CSV ─────────────────────────────────────────────

export interface ParsedCuentaRow {
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  es_cuenta_detalle: boolean
  parent_codigo: string
  error?: string
}

/**
 * Parsea el texto de un CSV y valida cada fila contra el schema Zod.
 * Detecta codigos duplicados con los existentes en la base de datos.
 */
export function parseCsv(text: string, existingCuentas: CuentaContable[]): ParsedCuentaRow[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  // Omitir cabecera
  const dataLines = lines.slice(1)
  const existingCodigos = new Set(existingCuentas.map((c) => c.codigo))

  return dataLines.map((line) => {
    const cols = line
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))

    const [codigo, nombre, tipo, naturaleza, esDetalle, parentCodigo] = cols

    const row: ParsedCuentaRow = {
      codigo: codigo?.toUpperCase() ?? '',
      nombre: nombre?.toUpperCase() ?? '',
      tipo: tipo?.toUpperCase() ?? '',
      naturaleza: naturaleza?.toUpperCase() ?? '',
      es_cuenta_detalle: esDetalle?.toUpperCase() === 'SI',
      parent_codigo: parentCodigo?.toUpperCase() ?? '',
    }

    const parsed = cuentaSchema.safeParse({
      codigo: row.codigo,
      nombre: row.nombre,
      tipo: row.tipo,
      naturaleza: row.naturaleza,
      nivel: 1,
      es_cuenta_detalle: row.es_cuenta_detalle,
    })

    if (!parsed.success) {
      row.error = parsed.error.issues[0]?.message ?? 'Datos invalidos'
    } else if (existingCodigos.has(row.codigo)) {
      row.error = 'Codigo ya existe'
    }

    return row
  })
}
