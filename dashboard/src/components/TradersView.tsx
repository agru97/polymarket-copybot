import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { updateTrader, removeTrader } from '@/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Trash2, Copy, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import AddTraderDialog from './AddTraderDialog'
import { fadeInUp, defaultTransition } from '@/lib/animations'
import { formatUsd } from '@/lib/format'
import type { StatsData, Trader } from '@/hooks/usePolling'

function EditableCell({
  value,
  onSave,
  type = 'text',
  placeholder = '',
  suffix = '',
  prefix = '',
  className = '',
  inputWidth = 'w-28',
}: {
  value: string | number
  onSave: (v: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  suffix?: string
  prefix?: string
  className?: string
  inputWidth?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== String(value) && trimmed !== '') onSave(trimmed)
    setEditing(false)
  }

  const cancel = () => {
    setDraft(String(value))
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={draft}
          onChange={(e) => setDraft(type === 'text' ? e.target.value.slice(0, 32) : e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
          onBlur={commit}
          className={`h-7 ${inputWidth} rounded border border-border bg-background px-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring ${className}`}
          placeholder={placeholder}
        />
      </span>
    )
  }

  const display = value === '' || value === 0 ? (placeholder || '—') : `${prefix}${value}${suffix}`

  return (
    <span
      className={`inline-flex items-center gap-1 group cursor-pointer hover:text-foreground transition-colors ${className}`}
      onClick={() => { setDraft(String(value)); setEditing(true) }}
    >
      {display}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </span>
  )
}

export default function TradersView({
  traders,
  stats,
  onUpdate,
}: {
  traders: Trader[]
  stats: StatsData | null
  onUpdate: () => void
}) {
  const byTrader = stats?.stats?.byTrader || []
  const traderPnl = new Map(byTrader.map(t => [t.trader_address, t.pnl]))

  const handleToggle = async (address: string, enabled: boolean) => {
    try {
      await updateTrader(address, { enabled })
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const handleRemove = async (address: string) => {
    try {
      const res = await removeTrader(address)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Trader removed')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  const activeCount = traders.filter(t => t.enabled).length

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={defaultTransition}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Trader Management</CardTitle>
              <CardDescription>{activeCount} active of {traders.length} traders</CardDescription>
            </div>
            <AddTraderDialog onAdd={onUpdate} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Active</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                <TableHead className="text-right">Max Trade</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {traders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No traders configured yet. Click "Add Trader" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                traders.map((t) => {
                  const pnl = traderPnl.get(t.address) ?? 0
                  return (
                    <TableRow key={t.address}>
                      <TableCell>
                        <Switch
                          checked={t.enabled}
                          onCheckedChange={(checked) => handleToggle(t.address, checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs cursor-default inline-flex items-center gap-1 group">
                                {t.address.slice(0, 6)}...{t.address.slice(-4)}
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(t.address); toast.success('Copied') }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  aria-label="Copy address"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="font-mono text-xs">{t.address}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          value={t.label || ''}
                          onSave={async (label) => {
                            try {
                              await updateTrader(t.address, { label })
                              onUpdate()
                              toast.success('Label updated')
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to update label')
                            }
                          }}
                          placeholder="Add label..."
                          className="text-muted-foreground"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="text-[10px] cursor-pointer hover:bg-primary/20 transition-colors"
                          onClick={async () => {
                            const newBucket = t.bucket === 'grinder' ? 'event' : 'grinder'
                            try {
                              await updateTrader(t.address, { bucket: newBucket })
                              onUpdate()
                              toast.success(`Bucket → ${newBucket}`)
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to update bucket')
                            }
                          }}
                        >
                          {t.bucket}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-right">
                        <EditableCell
                          value={t.multiplier}
                          type="number"
                          suffix="x"
                          onSave={async (val) => {
                            try {
                              await updateTrader(t.address, { multiplier: parseFloat(val) })
                              onUpdate()
                              toast.success('Multiplier updated')
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to update')
                            }
                          }}
                          inputWidth="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-right">
                        <EditableCell
                          value={t.maxTrade}
                          type="number"
                          prefix="$"
                          onSave={async (val) => {
                            try {
                              await updateTrader(t.address, { maxTrade: parseFloat(val) })
                              onUpdate()
                              toast.success('Max trade updated')
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to update')
                            }
                          }}
                          inputWidth="w-20"
                        />
                      </TableCell>
                      <TableCell className={`font-mono text-right ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatUsd(pnl)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove trader">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Trader</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove {t.label || t.address.slice(0, 8) + '...' + t.address.slice(-4)} from monitoring?
                                This will not close any existing positions.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemove(t.address)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
