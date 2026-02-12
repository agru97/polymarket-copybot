import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { saveSettings, updateNotifications, testNotification } from '@/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, Bell, Send } from 'lucide-react'
import { toast } from 'sonner'
import SettingsCard from './SettingsCard'
import { fadeInUp, defaultTransition } from '@/lib/animations'

const validationRules: Record<string, { min: number; max: number; label: string }> = {
  maxTotalExposure: { min: 1, max: 100000, label: 'Max Exposure' },
  maxGrinderTrade: { min: 0.5, max: 10000, label: 'Max Grinder' },
  maxEventTrade: { min: 0.5, max: 10000, label: 'Max Event' },
  maxOpenPositions: { min: 1, max: 100, label: 'Max Positions' },
  dailyLossLimit: { min: 1, max: 100000, label: 'Daily Loss' },
  equityStopLoss: { min: 0, max: 100000, label: 'Equity Stop' },
  slippageTolerance: { min: 0.1, max: 50, label: 'Slippage' },
  minTradeSize: { min: 0.1, max: 1000, label: 'Min Trade' },
  grinderMultiplier: { min: 0.01, max: 10, label: 'Grinder Mult' },
  eventMultiplier: { min: 0.01, max: 10, label: 'Event Mult' },
  minPrice: { min: 0, max: 1, label: 'Min Price' },
  maxPrice: { min: 0, max: 1, label: 'Max Price' },
}

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

function validateValues(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, rule] of Object.entries(validationRules)) {
    const raw = values[key]
    if (raw === undefined || raw === '') continue
    const num = parseFloat(raw)
    if (isNaN(num)) {
      errors[key] = `${rule.label} must be a number`
    } else if (num < rule.min) {
      errors[key] = `Min: ${rule.min}`
    } else if (num > rule.max) {
      errors[key] = `Max: ${rule.max}`
    }
  }
  // Cross-field: minPrice < maxPrice
  const minP = parseFloat(values.minPrice)
  const maxP = parseFloat(values.maxPrice)
  if (!isNaN(minP) && !isNaN(maxP) && minP >= maxP) {
    errors.minPrice = 'Must be less than Max Price'
  }
  return errors
}

function NotificationsCard() {
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleSaveNotifications = async () => {
    setSaving(true)
    try {
      await updateNotifications({ telegramBotToken, telegramChatId, discordWebhookUrl })
      toast.success('Notification settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await testNotification()
      toast.success('Test notification sent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="md:col-span-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tg-token" className="text-xs text-muted-foreground">Telegram Bot Token</Label>
              <Input
                id="tg-token"
                type="password"
                placeholder="123456:ABC-DEF..."
                value={telegramBotToken}
                onChange={e => setTelegramBotToken(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg-chat" className="text-xs text-muted-foreground">Telegram Chat ID</Label>
              <Input
                id="tg-chat"
                placeholder="-1001234567890"
                value={telegramChatId}
                onChange={e => setTelegramChatId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="discord-url" className="text-xs text-muted-foreground">Discord Webhook URL</Label>
              <Input
                id="discord-url"
                type="password"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhookUrl}
                onChange={e => setDiscordWebhookUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSaveNotifications} disabled={saving} size="sm" variant="outline">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button onClick={handleTest} disabled={testing} size="sm" variant="ghost">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {testing ? 'Sending...' : 'Test'}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Configure Telegram and/or Discord to receive trade alerts, risk limit warnings, and bot status changes.
        </p>
      </CardContent>
    </Card>
  )
}

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

  const hasChanges = useMemo(() => {
    return Object.keys(values).some(k => values[k] !== initialValues[k])
  }, [values, initialValues])

  // Only sync from server when we have no local edits — polling overwrote user changes before they could save
  useEffect(() => {
    if (!hasChanges && Object.keys(initialValues).length > 0) {
      setValues(initialValues)
    }
  }, [initialValues, hasChanges])

  const errors = useMemo(() => validateValues(values), [values])
  const hasErrors = Object.keys(errors).length > 0

  const handleChange = (key: string, v: string) => {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  const handleSave = async () => {
    if (hasErrors) {
      toast.error('Fix validation errors before saving')
      return
    }
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
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges || hasErrors}
          size="sm"
          title={
            hasErrors
              ? 'Fix validation errors first'
              : !hasChanges
                ? 'No changes to save'
                : undefined
          }
        >
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
            errors={errors}
          />
        ))}
        <NotificationsCard />
      </div>
    </motion.div>
  )
}
