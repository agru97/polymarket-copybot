import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface MarketData {
  market_name: string
  count: number
  pnl: number
}

function truncate(name: string, max = 28) {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '\u2026'
}

export default function MarketPnLChart({ data }: { data: MarketData[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        No market data yet
      </div>
    )
  }

  const chartData = data.map(m => ({
    name: truncate(m.market_name),
    pnl: m.pnl,
    count: m.count,
    label: `${m.count} trades`,
  }))

  const barHeight = Math.max(200, chartData.length * 28 + 20)

  return (
    <ResponsiveContainer width="100%" height={barHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={160}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]} maxBarSize={28} animationDuration={600}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.pnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'}
              fillOpacity={0.8}
            />
          ))}
          <LabelList
            dataKey="label"
            position="right"
            style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
