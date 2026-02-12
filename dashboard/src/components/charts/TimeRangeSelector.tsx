import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all'

export default function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (v: TimeRange) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as TimeRange)}
      size="sm"
    >
      <ToggleGroupItem value="24h" className="text-[10px] px-2 h-6">24H</ToggleGroupItem>
      <ToggleGroupItem value="7d" className="text-[10px] px-2 h-6">7D</ToggleGroupItem>
      <ToggleGroupItem value="30d" className="text-[10px] px-2 h-6">30D</ToggleGroupItem>
      <ToggleGroupItem value="90d" className="text-[10px] px-2 h-6">90D</ToggleGroupItem>
      <ToggleGroupItem value="all" className="text-[10px] px-2 h-6">ALL</ToggleGroupItem>
    </ToggleGroup>
  )
}
