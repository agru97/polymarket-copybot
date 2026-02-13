import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import ChartTooltip from './ChartTooltip'

interface ResolvedTrade {
  timestamp: string
  pnl: number
}

const WINDOW = 20

export default function WinRateChart({
  data,
  height = 200,
}: {
  data: ResolvedTrade[]
  height?: number
}) {
  const chartData = useMemo(() => {
    if (data.length < WINDOW) return []
    const points: { time: string; winRate: number }[] = []
    for (let i = WINDOW - 1; i < data.length; i++) {
      const window = data.slice(i - WINDOW + 1, i + 1)
      const wins = window.filter(t => t.pnl > 0).length
      const rate = Math.round((wins / WINDOW) * 1000) / 10
      const d = new Date(data[i].timestamp)
      points.push({
        time: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        winRate: rate,
      })
    }
    return points
  }, [data])

  if (chartData.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-muted-foreground">
        Need at least {WINDOW} resolved trades for win rate chart
      </div>
    )
  }

  const valueFormatter = (v: number) => `${v.toFixed(1)}%`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="winRateGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--profit))" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(var(--profit))" stopOpacity={0} />
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
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <ReferenceLine y={50} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="winRate"
          name="Win Rate"
          stroke="hsl(var(--profit))"
          strokeWidth={2}
          fill="url(#winRateGrad)"
          animationDuration={600}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
