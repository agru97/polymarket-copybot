import { Wallet, TrendingUp, CalendarDays, Target } from 'lucide-react'
import KPICard from './KPICard'
import MiniSparkline from './charts/MiniSparkline'
import type { StatsData } from '@/hooks/usePolling'

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export default function KPICards({ stats, risk }: { stats?: StatsData | null; risk?: Record<string, number> }) {
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

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <KPICard
        title="Equity"
        value={stats?.equity != null ? formatUsd(stats.equity) : '$—'}
        subtitle={stats?.dryRun ? 'Paper trading' : 'Live account'}
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
        subtitle={`${wins}W / ${losses}L`}
        icon={<Target className="h-4 w-4" />}
      />
    </div>
  )
}
