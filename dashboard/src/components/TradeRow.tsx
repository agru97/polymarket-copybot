import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TableCell } from '@/components/ui/table'
import StatusDot from './StatusDot'
import { cn } from '@/lib/utils'
import type { Trade } from '@/hooks/usePolling'

const statusVariant: Record<string, 'profit' | 'info' | 'warning' | 'loss' | 'secondary'> = {
  executed: 'profit',
  simulated: 'info',
  risk_blocked: 'warning',
  failed: 'loss',
  no_position: 'secondary',
}

export default function TradeRow({ trade, index }: { trade: Trade; index: number }) {
  const sideColor = trade.side?.toUpperCase().includes('CLOSE') || trade.side === 'SELL'
    ? 'text-loss'
    : 'text-profit'

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="border-b transition-colors hover:bg-muted/50"
    >
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs py-2.5">
        {trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : '—'}
      </TableCell>
      <TableCell className="py-2.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs cursor-default">
                {trade.trader_address
                  ? `${trade.trader_address.slice(0, 6)}...${trade.trader_address.slice(-4)}`
                  : '—'}
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
      <TableCell className={cn('font-mono text-xs py-2.5', sideColor)}>
        {trade.side || '—'}
      </TableCell>
      <TableCell className="font-mono text-right text-xs py-2.5">
        {trade.price != null ? trade.price.toFixed(2) : '—'}
      </TableCell>
      <TableCell className="font-mono text-right text-xs py-2.5">
        ${trade.size_usd ?? '—'}
      </TableCell>
      <TableCell className="py-2.5">
        <div className="flex items-center gap-1.5">
          <StatusDot status={trade.status} />
          <Badge
            variant={statusVariant[trade.status ?? ''] ?? 'secondary'}
            className="text-[10px]"
          >
            {trade.status || '—'}
          </Badge>
        </div>
      </TableCell>
    </motion.tr>
  )
}
