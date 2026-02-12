import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, ShieldOff, Timer } from 'lucide-react'
import BotStatusBadge from './BotStatusBadge'
import RiskGauge from './RiskGauge'
import ControlButtons from './ControlButtons'
import { formatUptime } from '@/lib/format'
import type { StatsData } from '@/hooks/usePolling'

function formatTimeRemaining(isoDate: string | null) {
  if (!isoDate) return ''
  const remaining = new Date(isoDate).getTime() - Date.now()
  if (remaining <= 0) return 'ending soon'
  const h = Math.floor(remaining / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
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

  const isDailyLossStopped = risk?.isDailyLossStopped || (risk?.dailyPnl != null && risk?.dailyLossLimit != null && risk.dailyPnl <= -risk.dailyLossLimit)
  const isEquityStopped = risk?.isEquityStopped || (risk?.equity != null && risk?.equityStopLoss != null && risk.equity <= risk.equityStopLoss)
  const isCooldownActive = risk?.isCooldownActive ?? false
  const hasAlerts = isDailyLossStopped || isEquityStopped || isCooldownActive

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Status & Risk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score */}
        {risk?.healthScore != null && (
          <>
            <div className="flex items-center justify-center">
              <div className={`flex items-center justify-center w-14 h-14 rounded-full border-2 font-bold text-xl ${
                risk.healthScore >= 8 ? 'border-profit text-profit' :
                risk.healthScore >= 5 ? 'border-warning text-warning' :
                'border-loss text-loss'
              }`}>
                {risk.healthScore}
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground">
              Risk Health {risk.healthScore >= 8 ? '— Healthy' : risk.healthScore >= 5 ? '— Caution' : '— Critical'}
            </p>
            <Separator />
          </>
        )}

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

        {/* Alert Banners — only when limits are breached */}
        {hasAlerts && (
          <>
            <Separator />
            <div className="space-y-2">
              {isDailyLossStopped && (
                <div className="flex items-start gap-2 rounded-md bg-loss/10 border border-loss/20 px-2.5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-loss shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-loss">Daily loss limit reached</p>
                    <p className="text-[10px] text-loss/70">All new trades blocked until midnight reset</p>
                  </div>
                </div>
              )}
              {isEquityStopped && (
                <div className="flex items-start gap-2 rounded-md bg-loss/10 border border-loss/20 px-2.5 py-2">
                  <ShieldOff className="h-3.5 w-3.5 text-loss shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-loss">Equity stop-loss hit</p>
                    <p className="text-[10px] text-loss/70">Bot auto-paused — equity at or below floor</p>
                  </div>
                </div>
              )}
              {isCooldownActive && (
                <div className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/20 px-2.5 py-2">
                  <Timer className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-warning">Loss cooldown active</p>
                    <p className="text-[10px] text-warning/70">
                      3 consecutive losses — {formatTimeRemaining(risk?.cooldownEndsAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* Risk Gauges */}
        <div className="space-y-3">
          <RiskGauge
            label="Exposure"
            value={risk?.totalExposure ?? 0}
            max={risk?.maxExposure ?? 1}
            formatValue={(v) => `$${v.toFixed(0)}`}
            formatMax={(v) => `$${v.toFixed(0)}`}
          />
          <RiskGauge
            label="Daily Loss"
            value={Math.max(0, -(risk?.dailyPnl ?? 0))}
            max={risk?.dailyLossLimit ?? 1}
            formatValue={(v) => `$${v.toFixed(2)}`}
            formatMax={(v) => `$${v.toFixed(2)}`}
            breached={isDailyLossStopped}
          />
          <RiskGauge
            label="Positions"
            value={risk?.openPositions ?? 0}
            max={risk?.maxPositions ?? 1}
            formatValue={(v) => String(Math.round(v))}
            formatMax={(v) => String(v)}
            breached={(risk?.openPositions ?? 0) >= (risk?.maxPositions ?? 1)}
          />
          <RiskGauge
            label="Stop-Loss Buffer"
            value={risk?.equity && risk?.equityStopLoss ? Math.max(0, risk.equity - risk.equityStopLoss) : 0}
            max={risk?.equity ?? 1}
            formatValue={(v) => `$${v.toFixed(0)}`}
            formatMax={(v) => `$${v.toFixed(0)}`}
            invertDanger
            breached={isEquityStopped}
          />
        </div>

        <Separator />

        {/* Trade Filters — hidden blockers made visible */}
        <div className="space-y-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trade Filters</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-[11px] text-muted-foreground">Min size</span>
            <span className="text-[11px] font-mono text-right">${risk?.minTradeSize?.toFixed(2) ?? '2.00'}</span>
            <span className="text-[11px] text-muted-foreground">Max trade</span>
            <span className="text-[11px] font-mono text-right">${risk?.maxPerTrade?.toFixed(2) ?? '8.00'}</span>
            <span className="text-[11px] text-muted-foreground">Price range</span>
            <span className="text-[11px] font-mono text-right">
              {risk?.priceRange ? `${risk.priceRange[0]} – ${risk.priceRange[1]}` : '0.08 – 0.97'}
            </span>
          </div>
        </div>

        <Separator />

        {/* Controls */}
        <ControlButtons onAction={onAction} botState={bot?.state} />
      </CardContent>
    </Card>
  )
}
