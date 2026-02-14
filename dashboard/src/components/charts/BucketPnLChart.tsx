import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface BucketData {
  bucket: string
  pnl: number
  count: number
}

export default function BucketPnLChart({ data }: { data: BucketData[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        No bucket data yet
      </div>
    )
  }

  const chartData = data.map(b => ({
    name: b.bucket.charAt(0).toUpperCase() + b.bucket.slice(1),
    pnl: b.pnl,
    count: b.count,
    label: `${b.count} trades`,
  }))

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
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]} maxBarSize={32} isAnimationActive={false}>
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
