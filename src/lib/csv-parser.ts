/**
 * Utilidad de parseo CSV sin dependencias externas.
 * Soporta:
 *  - BOM UTF-8 / UTF-16 LE
 *  - Finales de linea Windows (CRLF) y Unix (LF)
 *  - Campos entre comillas dobles con comas internas
 *  - Headers case-insensitive y tolerantes a espacios
 */

export interface CsvParseResult<T> {
  rows: T[]
  parseErrors: { line: number; message: string }[]
}

/**
 * Parsea un string CSV y mapea sus columnas a un tipo T segun el headerMap.
 *
 * @param raw       Contenido del archivo como string
 * @param headerMap Mapa de alias de columna (lowercase) → campo destino en T.
 *                  Ejemplo: { 'identificacion': 'identificacion', 'rif': 'identificacion' }
 */
export function parseCsv<T extends Record<string, string>>(
  raw: string,
  headerMap: Record<string, keyof T>
): CsvParseResult<T> {
  // Eliminar BOM y normalizar finales de linea
  const content = raw
    .replace(/^\uFEFF/, '')     // UTF-8 BOM
    .replace(/^\uFFFE/, '')     // UTF-16 LE BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const lines = content.split('\n').filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return {
      rows: [],
      parseErrors: [{ line: 0, message: 'El archivo está vacío' }],
    }
  }

  if (lines.length < 2) {
    return {
      rows: [],
      parseErrors: [{ line: 1, message: 'El archivo solo tiene el encabezado, no hay datos' }],
    }
  }

  // Parsear encabezado (primera fila)
  const headerCols = splitCsvRow(lines[0])
  const normalizedHeaders = headerCols.map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar tildes
  )

  // Construir mapa: indice de columna → campo destino
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

  // Verificar que al menos un campo del mapa se encontro
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
  const parseErrors: { line: number; message: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i])

    // Saltar filas completamente vacias
    if (cols.every((c) => c.trim() === '')) continue

    const obj: Record<string, string> = {}

    for (let j = 0; j < colToField.length; j++) {
      const field = colToField[j]
      if (field !== null) {
        obj[field as string] = (cols[j] ?? '').trim()
      }
    }

    rows.push(obj as T)
  }

  return { rows, parseErrors }
}

/**
 * Divide una fila CSV en columnas respetando campos entre comillas.
 */
function splitCsvRow(line: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Comilla doble escapada dentro de campo entre comillas
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }

  cols.push(current)
  return cols
}
