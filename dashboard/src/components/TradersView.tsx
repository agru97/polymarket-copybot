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
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AddTraderDialog from './AddTraderDialog'
import { fadeInUp, defaultTransition } from '@/lib/animations'
import type { StatsData, Trader } from '@/hooks/usePolling'

function formatUsd(n: number) {
  return `$${n.toFixed(2)}`
}

export default function TradersView({
  traders,
  stats,
  onUpdate,
}: {
  traders: Trader[]
  stats: StatsData | null
  config?: any
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
                              <span className="font-mono text-xs cursor-default">
                                {t.address.slice(0, 6)}...{t.address.slice(-4)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="font-mono text-xs">{t.address}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.label || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{t.bucket}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-right">{t.multiplier}x</TableCell>
                      <TableCell className="font-mono text-right">${t.maxTrade}</TableCell>
                      <TableCell className={`font-mono text-right ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatUsd(pnl)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
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
        </CardContent>
      </Card>
    </motion.div>
  )
}
