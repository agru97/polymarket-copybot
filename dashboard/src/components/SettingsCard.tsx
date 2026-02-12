import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import SettingsField from './SettingsField'

const fieldDescriptions: Record<string, string> = {
  maxTotalExposure: 'Maximum total USD exposure across all open positions',
  maxGrinderTrade: 'Maximum USD per single grinder-bucket trade',
  maxEventTrade: 'Maximum USD per single event-bucket trade',
  maxOpenPositions: 'Maximum number of concurrent open positions',
  dailyLossLimit: 'Max daily loss before all new trades are blocked until midnight',
  equityStopLoss: 'Equity floor — bot auto-pauses if equity falls to this level',
  slippageTolerance: 'Max allowed price slippage (%) between leader and our order',
  minTradeSize: 'Minimum trade size in USD — smaller trades are skipped',
  grinderMultiplier: 'Copy size = leader size x this multiplier for grinder bucket',
  eventMultiplier: 'Copy size = leader size x this multiplier for event bucket',
  minPrice: 'Skip markets with price below this threshold',
  maxPrice: 'Skip markets with price above this threshold',
}

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
  errors,
}: {
  title: string
  fields: Field[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  errors?: Record<string, string>
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(f => (
          <div key={f.key} className="space-y-1">
            <div className="flex items-center gap-1">
              <SettingsField
                id={f.key}
                label={f.label}
                value={values[f.key] ?? ''}
                onChange={(v) => onChange(f.key, v)}
                step={f.step}
                suffix={f.suffix}
              />
              {fieldDescriptions[f.key] && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[220px]">
                      <span className="text-xs">{fieldDescriptions[f.key]}</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {errors?.[f.key] && (
              <p className="text-[10px] text-loss ml-[7.75rem]">{errors[f.key]}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
