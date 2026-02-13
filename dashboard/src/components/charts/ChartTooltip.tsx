export default function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean
  payload?: { name?: string; value: number; color?: string; stroke?: string }[]
  label?: string
  valueFormatter?: (v: number, name?: string) => string
}) {
  if (!active || !payload?.length) return null

  const fmt = valueFormatter || ((v: number, name?: string) => {
    if (name === 'Drawdown') return `${v.toFixed(2)}%`
    return `$${v.toFixed(2)}`
  })

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-muted-foreground mb-1">{label}</p>}
      {payload.map((p, i: number) => (
        <p key={i} className="font-mono font-semibold" style={{ color: p.color || p.stroke }}>
          {p.name}: {fmt(p.value, p.name)}
        </p>
      ))}
    </div>
  )
}
