import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import BotStatusBadge from './BotStatusBadge'
import RiskGauge from './RiskGauge'
import ControlButtons from './ControlButtons'
import type { StatsData } from '@/hooks/usePolling'

function formatUptime(ms?: number) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function RiskPanel({
  stats,
  onAction,
}: {
  stats: StatsData | null
  onAction: () => void
}) {
  const risk = stats?.risk
  const bot = stats?.bot

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Status & Risk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bot Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">State</span>
            <BotStatusBadge state={bot?.state} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Uptime</span>
            <span className="text-xs font-mono">{formatUptime(bot?.uptime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Cycles</span>
            <span className="text-xs font-mono">{bot?.cycleCount ?? '—'}</span>
          </div>
          {(bot?.consecutiveErrors ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Errors</span>
              <span className="text-xs font-mono text-loss">{bot?.consecutiveErrors}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Risk Gauges */}
        <div className="space-y-3">
          <RiskGauge
            label="Exposure"
            value={risk?.totalExposure ?? 0}
            max={risk?.maxExposure ?? 1}
            formatValue={(v) => `$${v.toFixed(0)}`}
            formatMax={(v) => `$${v}`}
          />
          <RiskGauge
            label="Daily Loss"
            value={Math.max(0, -(risk?.dailyPnl ?? 0))}
            max={risk?.dailyLossLimit ?? 1}
            formatValue={(v) => `$${v.toFixed(0)}`}
            formatMax={(v) => `$${v}`}
          />
          <RiskGauge
            label="Positions"
            value={risk?.openPositions ?? 0}
            max={risk?.maxPositions ?? 1}
            formatValue={(v) => String(Math.round(v))}
            formatMax={(v) => String(v)}
          />
          <RiskGauge
            label="Equity Buffer"
            value={risk?.equity && risk?.equityStopLoss ? Math.max(0, risk.equity - risk.equityStopLoss) : 0}
            max={risk?.equity ?? 1}
            formatValue={(v) => `$${v.toFixed(0)}`}
            formatMax={(v) => `$${v.toFixed(0)}`}
            invertDanger
          />
        </div>

        <Separator />

        {/* Controls */}
        <ControlButtons onAction={onAction} />
      </CardContent>
    </Card>
  )
}
