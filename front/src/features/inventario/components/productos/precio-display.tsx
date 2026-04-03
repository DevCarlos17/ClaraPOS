import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

interface PrecioDisplayProps {
  usd: number | string
  tasa: number
}

export function PrecioDisplay({ usd, tasa }: PrecioDisplayProps) {
  const usdNum = typeof usd === 'string' ? parseFloat(usd) : usd
  const bsVal = usdToBs(isNaN(usdNum) ? 0 : usdNum, tasa)

  return (
    <div className="leading-tight">
      <span className="text-gray-900 font-medium">{formatUsd(usdNum)}</span>
      <br />
      <span className="text-xs text-gray-500">{formatBs(bsVal)}</span>
    </div>
  )
}
