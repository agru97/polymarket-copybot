import { Wallet, TrendingUp, CalendarDays, Target } from 'lucide-react'
import KPICard from './KPICard'
import MiniSparkline from './charts/MiniSparkline'
import { formatUsd } from '@/lib/format'
import type { StatsData } from '@/hooks/usePolling'

function formatChange(change: number, pct: number) {
  const sign = change >= 0 ? '+' : ''
  const color = change >= 0 ? 'text-profit' : 'text-loss'
  return (
    <span className={color}>
      {sign}{formatUsd(change)} ({sign}{pct.toFixed(1)}%)
    </span>
  )
}

export default function KPICards({ stats, risk }: { stats?: StatsData | null; risk?: Record<string, any> }) {
  const totalPnl = stats?.stats?.totalPnl ?? 0
  const dailyPnl = risk?.dailyPnl ?? 0
  const wins = stats?.stats?.wins ?? 0
  const losses = stats?.stats?.losses ?? 0
  const total = stats?.stats?.total ?? 0
  const winRate = total ? Math.round((wins / total) * 100) : 0

  const snapshots = stats?.stats?.recentSnapshots || []
  const equitySparkData = snapshots.slice(-24).map(s => ({ value: s.equity }))
  const pnlSparkData = snapshots.slice(-168).filter((_, i) => i % 7 === 0).map(s => ({ value: s.total_pnl }))

  const yesterdayPnl = stats?.stats?.dailyPnl && stats.stats.dailyPnl.length >= 2
    ? stats.stats.dailyPnl[stats.stats.dailyPnl.length - 2].pnl
    : 0

  // Compute today's equity change from first snapshot of the day
  const equity = stats?.equity ?? 0
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todaySnapshots = snapshots.filter(s => new Date(s.timestamp) >= todayStart)
  const firstEquityToday = todaySnapshots.length > 0 ? todaySnapshots[0].equity : null
  const equityChange = firstEquityToday != null ? equity - firstEquityToday : null
  const equityChangePct = firstEquityToday != null && firstEquityToday !== 0
    ? ((equity - firstEquityToday) / firstEquityToday) * 100
    : null

  const equitySubtitle = equityChange != null && equityChangePct != null
    ? formatChange(equityChange, equityChangePct)
    : stats?.dryRun ? 'Paper' : 'Live'

  const profitFactor = stats?.stats?.profitFactor ?? 0
  const pfDisplay = profitFactor === Infinity ? '---' : profitFactor.toFixed(2)

  const currentDrawdown = risk?.currentDrawdown ?? 0
  const maxDrawdown = risk?.maxDrawdown ?? 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard
          title={<>Equity{stats?.dryRun ? <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-warning/15 text-warning ml-1">PAPER</span> : null}</>}
          value={stats?.equity != null ? formatUsd(stats.equity) : '$—'}
          subtitle={equitySubtitle}
          icon={<Wallet className="h-4 w-4" />}
          sparkline={equitySparkData.length >= 2 ? <MiniSparkline data={equitySparkData} color="hsl(var(--primary))" /> : undefined}
        />
        <KPICard
          title="Total P&L"
          value={stats != null ? formatUsd(totalPnl) : '$—'}
          subtitle="All time"
          icon={<TrendingUp className="h-4 w-4" />}
          valueColor={totalPnl >= 0 ? 'text-profit' : 'text-loss'}
          sparkline={pnlSparkData.length >= 2 ? <MiniSparkline data={pnlSparkData} color={totalPnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} /> : undefined}
        />
        <KPICard
          title="Today P&L"
          value={stats != null ? formatUsd(dailyPnl) : '$—'}
          subtitle={yesterdayPnl !== 0 ? `Yesterday: ${formatUsd(yesterdayPnl)}` : 'Daily session'}
          icon={<CalendarDays className="h-4 w-4" />}
          valueColor={dailyPnl >= 0 ? 'text-profit' : 'text-loss'}
        />
        <KPICard
          title="Win Rate"
          value={`${winRate}%`}
          subtitle={<>{wins}W / {losses}L · {total} trades · <span className="text-muted-foreground">PF {pfDisplay}</span></>}
          icon={<Target className="h-4 w-4" />}
        />
      </div>
      {stats != null && (maxDrawdown > 0 || currentDrawdown > 0) && (
        <div className="grid gap-4 grid-cols-2">
          <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Drawdown</span>
            <span className="text-sm font-mono font-medium text-loss">-{currentDrawdown.toFixed(1)}%</span>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Max Drawdown</span>
            <span className="text-sm font-mono font-medium text-loss">-{maxDrawdown.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
