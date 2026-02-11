import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type TimeRange = '7d' | '14d' | '30d' | 'all'

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
      <ToggleGroupItem value="7d" className="text-[10px] px-2 h-6">7d</ToggleGroupItem>
      <ToggleGroupItem value="14d" className="text-[10px] px-2 h-6">14d</ToggleGroupItem>
      <ToggleGroupItem value="30d" className="text-[10px] px-2 h-6">30d</ToggleGroupItem>
      <ToggleGroupItem value="all" className="text-[10px] px-2 h-6">All</ToggleGroupItem>
    </ToggleGroup>
  )
}
