import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import TradeRow from './TradeRow'
import type { Trade } from '@/hooks/usePolling'

type TabValue = 'all' | 'executed' | 'simulated' | 'blocked' | 'failed'

const tabs: { value: TabValue; label: string; filter?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'executed', label: 'Executed', filter: 'executed' },
  { value: 'simulated', label: 'Simulated', filter: 'simulated' },
  { value: 'blocked', label: 'Blocked', filter: 'risk_blocked' },
  { value: 'failed', label: 'Failed', filter: 'failed' },
]

export default function TradeLog({ trades }: { trades: Trade[] }) {
  const [activeTab, setActiveTab] = useState<TabValue>('all')

  const counts: Record<string, number> = {
    all: trades.length,
    executed: trades.filter(t => t.status === 'executed').length,
    simulated: trades.filter(t => t.status === 'simulated').length,
    blocked: trades.filter(t => t.status === 'risk_blocked').length,
    failed: trades.filter(t => t.status === 'failed').length,
  }

  const filtered = activeTab === 'all'
    ? trades
    : trades.filter(t => t.status === tabs.find(tab => tab.value === activeTab)?.filter)

  if (!trades.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Trade Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-medium">Trade Log</CardTitle>
          <div className="flex gap-1 flex-wrap">
            {tabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {tab.label}
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-[18px] justify-center">
                  {counts[tab.value]}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Time</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Trader</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Market</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Side</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold text-right">Price</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold text-right">Size</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filtered.map((trade, i) => (
                  <TradeRow key={`${trade.timestamp}-${i}`} trade={trade} index={i} />
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
