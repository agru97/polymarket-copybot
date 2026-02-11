import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SettingsField from './SettingsField'

interface Field {
  key: string
  label: string
  step: string
  suffix?: string
}

export default function SettingsCard({
  title,
  fields,
  values,
  onChange,
}: {
  title: string
  fields: Field[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(f => (
          <SettingsField
            key={f.key}
            id={f.key}
            label={f.label}
            value={values[f.key] ?? ''}
            onChange={(v) => onChange(f.key, v)}
            step={f.step}
            suffix={f.suffix}
          />
        ))}
      </CardContent>
    </Card>
  )
}
