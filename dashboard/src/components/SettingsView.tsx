import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { saveSettings } from '@/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import SettingsCard from './SettingsCard'
import { fadeInUp, defaultTransition } from '@/lib/animations'

const sections = [
  {
    title: 'Trade Caps',
    fields: [
      { key: 'maxTotalExposure', label: 'Max Exposure', step: '1', suffix: '$' },
      { key: 'maxGrinderTrade', label: 'Max Grinder', step: '0.5', suffix: '$' },
      { key: 'maxEventTrade', label: 'Max Event', step: '0.5', suffix: '$' },
      { key: 'maxOpenPositions', label: 'Max Positions', step: '1' },
    ],
  },
  {
    title: 'Risk Limits',
    fields: [
      { key: 'dailyLossLimit', label: 'Daily Loss', step: '0.5', suffix: '$' },
      { key: 'equityStopLoss', label: 'Equity Stop', step: '1', suffix: '$' },
      { key: 'slippageTolerance', label: 'Slippage', step: '0.5', suffix: '%' },
      { key: 'minTradeSize', label: 'Min Trade', step: '0.5', suffix: '$' },
    ],
  },
  {
    title: 'Copy Sizing',
    fields: [
      { key: 'grinderMultiplier', label: 'Grinder Mult', step: '0.05', suffix: 'x' },
      { key: 'eventMultiplier', label: 'Event Mult', step: '0.05', suffix: 'x' },
      { key: 'minPrice', label: 'Min Price', step: '0.01' },
      { key: 'maxPrice', label: 'Max Price', step: '0.01' },
    ],
  },
]

export default function SettingsView({ config, onSave }: { config?: any; onSave: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const initialValues = useMemo((): Record<string, string> => {
    if (!config) return {}
    return {
      maxTotalExposure: String(config.caps?.maxTotalExposure ?? ''),
      maxGrinderTrade: String(config.caps?.maxGrinderTrade ?? ''),
      maxEventTrade: String(config.caps?.maxEventTrade ?? ''),
      maxOpenPositions: String(config.caps?.maxOpenPositions ?? ''),
      dailyLossLimit: String(config.risk?.dailyLossLimit ?? ''),
      equityStopLoss: String(config.risk?.equityStopLoss ?? ''),
      slippageTolerance: String(config.risk?.slippageTolerance ?? ''),
      minTradeSize: String(config.risk?.minTradeSize ?? ''),
      grinderMultiplier: String(config.sizing?.grinderMultiplier ?? ''),
      eventMultiplier: String(config.sizing?.eventMultiplier ?? ''),
      minPrice: String(config.risk?.minPrice ?? ''),
      maxPrice: String(config.risk?.maxPrice ?? ''),
    }
  }, [config])

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const hasChanges = useMemo(() => {
    return Object.keys(values).some(k => values[k] !== initialValues[k])
  }, [values, initialValues])

  const handleChange = (key: string, v: string) => {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveSettings({
        maxTotalExposure: parseFloat(values.maxTotalExposure),
        maxGrinderTrade: parseFloat(values.maxGrinderTrade),
        maxEventTrade: parseFloat(values.maxEventTrade),
        maxOpenPositions: parseInt(values.maxOpenPositions, 10),
        dailyLossLimit: parseFloat(values.dailyLossLimit),
        equityStopLoss: parseFloat(values.equityStopLoss),
        slippageTolerance: parseFloat(values.slippageTolerance),
        minTradeSize: parseFloat(values.minTradeSize),
        grinderMultiplier: parseFloat(values.grinderMultiplier),
        eventMultiplier: parseFloat(values.eventMultiplier),
        minPrice: parseFloat(values.minPrice),
        maxPrice: parseFloat(values.maxPrice),
      })
      toast.success('Settings saved successfully')
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading settings...
      </div>
    )
  }

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={defaultTransition} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          {hasChanges && (
            <Badge variant="warning" className="text-[10px]">Unsaved changes</Badge>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm">
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map(section => (
          <SettingsCard
            key={section.title}
            title={section.title}
            fields={section.fields}
            values={values}
            onChange={handleChange}
          />
        ))}
      </div>
    </motion.div>
  )
}
