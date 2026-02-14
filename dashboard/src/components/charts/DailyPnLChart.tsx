import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import ChartTooltip from './ChartTooltip'

interface DailyPnl {
  day: string
  pnl: number
  trades?: number
}

export default function DailyPnLChart({
  data,
  height = 200,
}: {
  data: DailyPnl[]
  height?: number
}) {
  const chartData = useMemo(() => {
    let cumulative = 0
    return data.map(d => {
      cumulative += d.pnl
      return {
        date: d.day.length >= 10 ? d.day.slice(5) : d.day,
        pnl: d.pnl,
        cumulative: Math.round(cumulative * 100) / 100,
      }
    })
  }, [data])

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-muted-foreground">
        No daily P&L data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
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
        <Bar dataKey="pnl" name="Daily P&L" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
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
          name="Period Cumulative"
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
