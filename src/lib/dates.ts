/** Returns today as YYYY-MM-DD string in local time */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns current datetime as UTC ISO 8601 string (YYYY-MM-DDTHH:mm:ss.SSSZ).
 *  Usando UTC se evita que Supabase (TIMESTAMPTZ) malinterprete la hora local
 *  como UTC, lo que causaria un desfase de 4 horas en Venezuela (UTC-4).
 */
export function localNow(): string {
  return new Date().toISOString()
}

/** Returns YYYY-MM-DD for N days ago */
export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns YYYY-MM-DD for the 1st of current month */
export function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
