import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

interface CurrencyDisplayProps {
  usd: number | string
  tasa: number
  className?: string
}

export function CurrencyDisplay({ usd, tasa, className }: CurrencyDisplayProps) {
  const usdNum = typeof usd === 'string' ? parseFloat(usd) : usd
  const bsVal = usdToBs(usdNum, tasa)

  return (
    <div className={className}>
      <span className="font-medium tabular-nums">{formatUsd(usdNum)}</span>
      {tasa > 0 && (
        <span className="block text-xs text-muted-foreground tabular-nums">{formatBs(bsVal)}</span>
      )}
    </div>
  )
}
