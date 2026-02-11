export default function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  valueFormatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null

  const fmt = valueFormatter || ((v: number) => `$${v.toFixed(2)}`)

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-mono font-semibold" style={{ color: p.color || p.stroke }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}
