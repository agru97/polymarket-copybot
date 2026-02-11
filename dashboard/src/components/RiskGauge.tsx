import { cn } from '@/lib/utils'

export default function RiskGauge({
  label,
  value,
  max,
  formatValue,
  formatMax,
  invertDanger = false,
}: {
  label: string
  value: number
  max: number
  formatValue: (v: number) => string
  formatMax: (v: number) => string
  invertDanger?: boolean
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  const utilization = invertDanger ? 100 - pct : pct

  const colorClass = utilization > 80
    ? 'bg-loss'
    : utilization > 60
    ? 'bg-warning'
    : 'bg-profit'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {formatValue(value)} / {formatMax(max)}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            colorClass,
            utilization > 80 && 'shadow-[0_0_8px_hsl(var(--loss)/0.4)]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right">
        <span className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
