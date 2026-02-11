import { useState, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import TimeRangeSelector, { type TimeRange } from './TimeRangeSelector'

interface DailyPnl {
  day: string
  pnl: number
  trades?: number
}

export default function DailyPnLChart({ data }: { data: DailyPnl[] }) {
  const [range, setRange] = useState<TimeRange>('14d')

  const filtered = useMemo(() => {
    if (range === 'all') return data
    const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
    return data.slice(-days)
  }, [data, range])

  const chartData = useMemo(() => {
    let cumulative = 0
    return filtered.map(d => {
      cumulative += d.pnl
      return {
        date: d.day.slice(5),
        pnl: d.pnl,
        cumulative,
      }
    })
  }, [filtered])

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
        No daily P&L data yet
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
          <Bar dataKey="pnl" name="Daily P&L" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={600}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.pnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="cumulative"
            name="Cumulative"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            animationDuration={600}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
