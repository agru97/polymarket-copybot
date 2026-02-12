import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TableCell } from '@/components/ui/table'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Trade } from '@/hooks/usePolling'

const statusVariant: Record<string, 'profit' | 'info' | 'warning' | 'loss' | 'secondary'> = {
  executed: 'profit',
  simulated: 'info',
  risk_blocked: 'warning',
  failed: 'loss',
  no_position: 'secondary',
}

function formatSide(side?: string): { direction: string; outcome: string } {
  if (!side) return { direction: '', outcome: '—' }
  if (side.startsWith('CLOSE_')) return { direction: 'Close', outcome: side.slice(6) }
  if (side === 'SELL') return { direction: 'Sell', outcome: '' }
  return { direction: 'Buy', outcome: side }
}

function formatPnl(pnl?: number | null) {
  if (pnl == null || pnl === 0) return '—'
  const abs = Math.abs(pnl).toFixed(2)
  return pnl > 0 ? `+$${abs}` : `-$${abs}`
}

function formatSize(size?: number | null) {
  if (size == null) return '—'
  return `$${size.toFixed(2)}`
}

const statusLabel: Record<string, string> = {
  executed: 'Executed',
  simulated: 'Simulated',
  risk_blocked: 'Blocked',
  failed: 'Failed',
  no_position: 'No Position',
}

export default function TradeRow({ trade, index, traderLabel }: { trade: Trade; index: number; traderLabel?: string }) {
  const { direction, outcome } = formatSide(trade.side)
  const isClose = direction === 'Close' || direction === 'Sell'

  const displayTime = trade.timestamp
    ? new Date(trade.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' +
      new Date(trade.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="border-b transition-colors hover:bg-muted/50"
    >
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs py-2.5">
        {displayTime}
      </TableCell>
      <TableCell className="py-2.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs cursor-default inline-flex items-center gap-1 group">
                {traderLabel || (trade.trader_address
                  ? `${trade.trader_address.slice(0, 6)}...${trade.trader_address.slice(-4)}`
                  : '—')}
                {trade.trader_address && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(trade.trader_address!); toast.success('Copied') }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-mono text-xs">{trade.trader_address}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="max-w-[180px] truncate text-xs py-2.5" title={trade.market_name}>
        {trade.market_name || '—'}
      </TableCell>
      <TableCell className="text-xs py-2.5">
        <span className={cn('font-medium', isClose ? 'text-loss' : 'text-profit')}>{direction}</span>
        {outcome && <span className="text-muted-foreground"> · {outcome}</span>}
      </TableCell>
      <TableCell className="font-mono text-right text-xs py-2.5">
        {trade.price != null ? trade.price.toFixed(2) : '—'}
      </TableCell>
      <TableCell className="font-mono text-right text-xs py-2.5">
        {formatSize(trade.size_usd)}
      </TableCell>
      <TableCell className={cn(
        'font-mono text-right text-xs py-2.5',
        trade.pnl != null && trade.pnl !== 0
          ? trade.pnl > 0 ? 'text-profit' : 'text-loss'
          : 'text-muted-foreground'
      )}>
        {formatPnl(trade.pnl)}
      </TableCell>
      <TableCell className="py-2.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={statusVariant[trade.status ?? ''] ?? 'secondary'}
                className="text-[10px]"
              >
                {statusLabel[trade.status ?? ''] ?? trade.status ?? '—'}
              </Badge>
            </TooltipTrigger>
            {trade.notes && (
              <TooltipContent side="left" className="max-w-[280px]">
                <span className="text-xs">{trade.notes}</span>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </motion.tr>
  )
}
