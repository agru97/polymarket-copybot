import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface TraderData {
  trader_address: string
  count: number
  pnl: number
}

export default function TraderPnLChart({
  data,
  traderLabels = {},
}: {
  data: TraderData[]
  traderLabels?: Record<string, string>
}) {
  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        No trader data yet
      </div>
    )
  }

  const chartData = data.map(t => {
    const addr = t.trader_address || ''
    const friendly = traderLabels[addr.toLowerCase()]
    return {
      name: friendly || (addr.length >= 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr || '—'),
      pnl: t.pnl ?? 0,
      count: t.count ?? 0,
      label: `${t.count ?? 0} trades`,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={200}>
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
          width={100}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
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
