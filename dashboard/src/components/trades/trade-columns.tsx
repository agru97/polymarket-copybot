'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Trade } from '@/hooks/usePolling'

const statusVariant: Record<string, 'profit' | 'info' | 'warning' | 'loss' | 'secondary'> = {
  executed: 'profit',
  simulated: 'info',
  risk_blocked: 'warning',
  slippage_blocked: 'warning',
  failed: 'loss',
  rejected: 'loss',
  filtered: 'secondary',
  no_position: 'secondary',
}

const statusLabel: Record<string, string> = {
  executed: 'Executed',
  simulated: 'Simulated',
  risk_blocked: 'Blocked',
  slippage_blocked: 'Slippage',
  failed: 'Failed',
  rejected: 'Rejected',
  filtered: 'Skipped',
  no_position: 'No Position',
}

function formatSide(side?: string): { direction: string; outcome: string } {
  if (!side) return { direction: '', outcome: '—' }
  if (side.startsWith('CLOSE_')) return { direction: 'Close', outcome: side.slice(6) }
  if (side === 'SELL') return { direction: 'Sell', outcome: '' }
  return { direction: 'Buy', outcome: side }
}

export function getTradeColumns(traderLabels: Record<string, string>): ColumnDef<Trade>[] {
  return [
    {
      accessorKey: 'timestamp',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Time" />
      ),
      cell: ({ row }) => {
        const ts = row.original.timestamp
        const display = ts
          ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' +
            new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          : '—'
        return (
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {display}
          </span>
        )
      },
    },
    {
      accessorKey: 'trader_address',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Trader" />
      ),
      cell: ({ row }) => {
        const trade = row.original
        const label = traderLabels[trade.trader_address?.toLowerCase() ?? ''] ?? ''
        const display = label || (trade.trader_address
          ? `${trade.trader_address.slice(0, 6)}...${trade.trader_address.slice(-4)}`
          : '—')
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs cursor-default inline-flex items-center gap-1 group">
                  {display}
                  {trade.trader_address && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(trade.trader_address!)
                        toast.success('Copied')
                      }}
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
        )
      },
    },
    {
      accessorKey: 'market_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Market" />
      ),
      cell: ({ row }) => (
        <span
          className="max-w-[180px] truncate text-xs block"
          title={row.original.market_name ?? undefined}
        >
          {row.original.market_name || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'side',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Side" />
      ),
      cell: ({ row }) => {
        const { direction, outcome } = formatSide(row.original.side)
        const isClose = direction === 'Close' || direction === 'Sell'
        return (
          <span className="text-xs">
            <span className={cn('font-medium', isClose ? 'text-loss' : 'text-profit')}>
              {direction}
            </span>
            {outcome && <span className="text-muted-foreground"> · {outcome}</span>}
          </span>
        )
      },
    },
    {
      accessorKey: 'price',
      meta: { align: 'right' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Price" className="justify-end" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-right text-xs">
          {row.original.price != null ? row.original.price.toFixed(2) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'size_usd',
      meta: { align: 'right' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Size" className="justify-end" />
      ),
      cell: ({ row }) => {
        const v = row.original.size_usd
        return (
          <span className="font-mono text-right text-xs">
            {v != null ? `$${v.toFixed(2)}` : '—'}
          </span>
        )
      },
    },
    {
      accessorKey: 'pnl',
      meta: { align: 'right' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="P&L" className="justify-end" />
      ),
      cell: ({ row }) => {
        const pnl = row.original.pnl
        let formatted = '—'
        if (pnl != null && pnl !== 0) {
          const abs = Math.abs(pnl).toFixed(2)
          formatted = pnl > 0 ? `+$${abs}` : `-$${abs}`
        }
        return (
          <span
            className={cn(
              'font-mono text-right text-xs',
              pnl != null && pnl !== 0
                ? pnl > 0
                  ? 'text-profit'
                  : 'text-loss'
                : 'text-muted-foreground'
            )}
          >
            {formatted}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge
          variant={statusVariant[row.original.status ?? ''] ?? 'secondary'}
          className="text-[10px]"
        >
          {statusLabel[row.original.status ?? ''] ?? row.original.status ?? '—'}
        </Badge>
      ),
    },
    {
      accessorKey: 'notes',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Notes" />
      ),
      cell: ({ row }) => (
        <span
          className="max-w-[220px] truncate text-xs text-muted-foreground block"
          title={row.original.notes ?? undefined}
        >
          {row.original.notes || '—'}
        </span>
      ),
    },
  ]
}
