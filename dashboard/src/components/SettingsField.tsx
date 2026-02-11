import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SettingsField({
  id,
  label,
  value,
  onChange,
  step,
  suffix,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  step?: string
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="text-sm text-muted-foreground w-28 shrink-0">
        {label}
      </Label>
      <div className="relative flex-1 max-w-[120px]">
        <Input
          id={id}
          type="number"
          step={step}
          className="font-mono text-sm pr-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
