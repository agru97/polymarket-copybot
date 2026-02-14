import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { formatUsd, formatSide } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { Position } from '@/hooks/usePolling'

function formatPnl(pnl: number): string {
  const abs = Math.abs(pnl).toFixed(2)
  return pnl >= 0 ? `+$${abs}` : `-$${abs}`
}

function getPositionColumns(): ColumnDef<Position>[] {
  return [
    {
      accessorKey: 'market_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Market" />
      ),
      cell: ({ row }) => {
        const name = row.original.market_name || row.original.market_id
        return (
          <span
            className="max-w-[220px] truncate text-xs block"
            title={name}
          >
            {name}
          </span>
        )
      },
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
          <span className="text-xs whitespace-nowrap">
            <span className={cn('font-medium', isClose ? 'text-loss' : 'text-profit')}>
              {direction}
            </span>
            {outcome && <span className="text-muted-foreground"> · {outcome}</span>}
          </span>
        )
      },
    },
    {
      accessorKey: 'entry_price',
      meta: { align: 'right' as const },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Entry" className="justify-end" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-right text-xs">
          {row.original.entry_price.toFixed(4)}
        </span>
      ),
    },
    {
      accessorKey: 'current_price',
      meta: { align: 'right' as const },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Current" className="justify-end" />
      ),
      cell: ({ row }) => {
        const current = row.original.current_price
        const entry = row.original.entry_price
        return (
          <span className={cn(
            'font-mono text-right text-xs',
            current > entry ? 'text-profit' : current < entry ? 'text-loss' : ''
          )}>
            {current > 0 ? current.toFixed(4) : '--'}
          </span>
        )
      },
    },
    {
      accessorKey: 'size_usd',
      meta: { align: 'right' as const },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Size" className="justify-end" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-right text-xs">
          {formatUsd(row.original.size_usd)}
        </span>
      ),
    },
    {
      accessorKey: 'unrealized_pnl',
      meta: { align: 'right' as const },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Unreal. P&L" className="justify-end" />
      ),
      cell: ({ row }) => {
        const pnl = row.original.unrealized_pnl
        return (
          <span
            className={cn(
              'font-mono text-right text-xs font-medium',
              pnl > 0 ? 'text-profit' : pnl < 0 ? 'text-loss' : 'text-muted-foreground'
            )}
          >
            {pnl !== 0 ? formatPnl(pnl) : '--'}
          </span>
        )
      },
    },
    {
      accessorKey: 'bucket',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Bucket" />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px]">
          {row.original.bucket}
        </Badge>
      ),
    },
    {
      accessorKey: 'opened_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Opened" />
      ),
      cell: ({ row }) => {
        const ts = row.original.opened_at
        const display = ts
          ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' +
            new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          : '--'
        return (
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {display}
          </span>
        )
      },
    },
  ]
}

export default function OpenPositions({ positions }: { positions: Position[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'unrealized_pnl', desc: true },
  ])

  const columns = useMemo(() => getPositionColumns(), [])

  const totalExposure = useMemo(
    () => positions.reduce((sum, p) => sum + p.size_usd, 0),
    [positions]
  )

  const totalUnrealizedPnl = useMemo(
    () => positions.reduce((sum, p) => sum + p.unrealized_pnl, 0),
    [positions]
  )

  if (!positions.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-sm text-muted-foreground">
            No open positions. Positions will appear here when the bot enters trades.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center">
              {positions.length}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Exposure: <span className="font-mono font-medium text-foreground">{formatUsd(totalExposure)}</span>
            </span>
            <span className="text-muted-foreground">
              Unreal. P&L:{' '}
              <span
                className={cn(
                  'font-mono font-medium',
                  totalUnrealizedPnl > 0 ? 'text-profit' : totalUnrealizedPnl < 0 ? 'text-loss' : 'text-foreground'
                )}
              >
                {formatPnl(totalUnrealizedPnl)}
              </span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[350px] overflow-auto rounded-md border border-border">
          <DataTable
            columns={columns}
            data={positions}
            sorting={sorting}
            onSortingChange={setSorting as (updater: SortingState | ((prev: SortingState) => SortingState)) => void}
          />
        </div>
      </CardContent>
    </Card>
  )
}
