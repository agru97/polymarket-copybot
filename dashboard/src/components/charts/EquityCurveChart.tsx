import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts'
import ChartTooltip from './ChartTooltip'
import type { TimeRange } from './TimeRangeSelector'

interface Snapshot {
  timestamp: string
  equity: number
  total_exposure: number
}

function formatXAxis(timestamp: string, range: TimeRange) {
  const d = new Date(timestamp)
  switch (range) {
    case '24h':
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    case '7d':
      return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
    case '30d':
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    case '90d':
      return d.toLocaleDateString([], { month: 'short' })
    default:
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export default function EquityCurveChart({
  snapshots,
  range = '7d',
  height = 220,
}: {
  snapshots: Snapshot[]
  range?: TimeRange
  height?: number
}) {
  const [showDrawdown, setShowDrawdown] = useState(false)

  const filtered = useMemo(() => {
    if (range === 'all') return snapshots
    const now = Date.now()
    const ms: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    }
    const cutoff = now - (ms[range] ?? 0)
    return snapshots.filter(s => new Date(s.timestamp).getTime() >= cutoff)
  }, [snapshots, range])

  const data = useMemo(() => {
    if (filtered.length === 0) return []
    let peak = filtered[0].equity
    return filtered.map(s => {
      if (s.equity > peak) peak = s.equity
      const dd = peak > 0 ? -((peak - s.equity) / peak) * 100 : 0
      return {
        time: formatXAxis(s.timestamp, range),
        equity: s.equity,
        exposure: s.total_exposure,
        drawdown: Math.round(dd * 100) / 100,
      }
    })
  }, [filtered, range])

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-muted-foreground">
        No equity data yet — snapshots will appear after the bot runs.
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-1">
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDrawdown}
            onChange={e => setShowDrawdown(e.target.checked)}
            className="rounded border-border h-3 w-3"
          />
          Show Drawdown
        </label>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: showDrawdown ? 40 : 5, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.12} />
              <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--loss))" stopOpacity={0} />
              <stop offset="100%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="equity"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          {showDrawdown && (
            <YAxis
              yAxisId="drawdown"
              orientation="right"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={['dataMin', 0]}
            />
          )}
          <Tooltip content={<ChartTooltip />} />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="equity"
            name="Equity"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            fill="url(#equityGrad)"
            animationDuration={600}
          />
          <Line
            yAxisId="equity"
            type="monotone"
            dataKey="exposure"
            name="Exposure"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={600}
          />
          {showDrawdown && (
            <Area
              yAxisId="drawdown"
              type="monotone"
              dataKey="drawdown"
              name="Drawdown"
              stroke="hsl(var(--loss))"
              strokeWidth={1}
              fill="url(#drawdownGrad)"
              animationDuration={600}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
