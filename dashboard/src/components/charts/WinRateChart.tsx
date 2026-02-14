import { useMemo, useId } from 'react'
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
  const gradId = useId()

  // O(n) sliding window instead of O(n²) slice+filter
  const chartData = useMemo(() => {
    if (data.length < WINDOW) return []
    const points: { time: string; winRate: number }[] = []
    let wins = 0

    // Seed the first window
    for (let i = 0; i < WINDOW; i++) {
      if (data[i].pnl > 0) wins++
    }
    points.push({
      time: new Date(data[WINDOW - 1].timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      winRate: Math.round((wins / WINDOW) * 1000) / 10,
    })

    // Slide: add new element, remove oldest
    for (let i = WINDOW; i < data.length; i++) {
      if (data[i].pnl > 0) wins++
      if (data[i - WINDOW].pnl > 0) wins--
      points.push({
        time: new Date(data[i].timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        winRate: Math.round((wins / WINDOW) * 1000) / 10,
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={50} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="winRate"
          name="Win Rate"
          stroke="hsl(var(--profit))"
          strokeWidth={2}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
