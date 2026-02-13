import { cn } from '@/lib/utils'

export default function RiskGauge({
  label,
  value,
  max,
  formatValue,
  formatMax,
  invertDanger = false,
  breached = false,
}: {
  label: string
  value: number
  max: number
  formatValue: (v: number) => string
  formatMax: (v: number) => string
  invertDanger?: boolean
  breached?: boolean
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  const utilization = invertDanger ? 100 - pct : pct

  const colorClass = breached || utilization > 80
    ? 'bg-loss'
    : utilization > 60
    ? 'bg-warning'
    : 'bg-profit'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {formatValue(value)} / {formatMax(max)}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            colorClass,
            (breached || utilization > 80) && 'shadow-[0_0_8px_hsl(var(--loss)/0.4)]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right">
        {breached ? (
          <span className="text-[10px] font-semibold text-loss tracking-wide">LIMIT</span>
        ) : (
          <span className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}%</span>
        )}
      </div>
    </div>
  )
}
