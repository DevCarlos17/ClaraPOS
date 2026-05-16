import * as XLSX from 'xlsx'
import type { CsvParseResult } from './csv-parser'

/**
 * Parsea un archivo Excel (.xlsx, .xls) y mapea sus columnas usando el mismo
 * sistema de headerMap que parseCsv. Devuelve la misma estructura CsvParseResult.
 */
export async function parseExcel<T extends Record<string, string>>(
  file: File,
  headerMap: Record<string, keyof T>
): Promise<CsvParseResult<T>> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    dateNF: 'yyyy-mm-dd',
  })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return {
      rows: [],
      parseErrors: [{ line: 0, message: 'El archivo Excel esta vacio' }],
    }
  }

  const worksheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  }) as unknown[][]

  if (rawData.length === 0) {
    return {
      rows: [],
      parseErrors: [{ line: 0, message: 'El archivo Excel esta vacio' }],
    }
  }

  if (rawData.length < 2) {
    return {
      rows: [],
      parseErrors: [{ line: 1, message: 'El archivo solo tiene el encabezado, no hay datos' }],
    }
  }

  const headerCols = (rawData[0] as unknown[]).map((h) => String(h ?? ''))
  const normalizedHeaders = headerCols.map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  )

  const colToField: (keyof T | null)[] = normalizedHeaders.map((h) => {
    for (const [alias, field] of Object.entries(headerMap)) {
      const normalizedAlias = alias
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (h === normalizedAlias) return field
    }
    return null
  })

  const camposEncontrados = colToField.filter((f) => f !== null).length
  if (camposEncontrados === 0) {
    return {
      rows: [],
      parseErrors: [
        {
          line: 1,
          message: `No se reconocieron columnas del archivo. Encabezados encontrados: ${headerCols.join(', ')}`,
        },
      ],
    }
  }

  const rows: T[] = []

  for (let i = 1; i < rawData.length; i++) {
    const cols = rawData[i] as unknown[]
    if (cols.every((c) => String(c ?? '').trim() === '')) continue

    const obj: Record<string, string> = {}
    for (let j = 0; j < colToField.length; j++) {
      const field = colToField[j]
      if (field !== null) {
        obj[field as string] = String(cols[j] ?? '').trim()
      }
    }
    rows.push(obj as T)
  }

  return { rows, parseErrors: [] }
}
