import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function MiniSparkline({
  data,
  dataKey = 'value',
  color = 'hsl(var(--primary))',
  height = 24,
}: {
  data: Record<string, number>[]
  dataKey?: string
  color?: string
  height?: number
}) {
  if (!data || data.length < 2) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
