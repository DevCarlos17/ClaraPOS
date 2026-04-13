export function usdToBs(usd: number, tasa: number): number {
  return Number((usd * tasa).toFixed(2))
}

export function bsToUsd(bs: number, tasa: number): number {
  if (tasa === 0) return 0
  return Number((bs / tasa).toFixed(2))
}

export function formatUsd(val: number | string): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '$0.00'
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatBs(val: number | string): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return 'Bs. 0,00'
  return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatTasa(val: number | string): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '0,0000'
  return num.toFixed(4).replace('.', ',')
}
