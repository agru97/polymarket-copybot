import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { getTradeColumns } from '@/components/trades/trade-columns'
import { downloadExport } from '@/api'
import type { Trade, Trader } from '@/hooks/usePolling'
import type { SortingState } from '@tanstack/react-table'

type TabValue = 'all' | 'executed' | 'simulated' | 'blocked' | 'failed' | 'skipped'
type DateFilter = 'all' | 'today' | '7d' | '30d'

const tabs: { value: TabValue; label: string; filter?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'executed', label: 'Executed', filter: 'executed' },
  { value: 'simulated', label: 'Simulated', filter: 'simulated' },
  { value: 'blocked', label: 'Blocked', filter: 'risk_blocked' },
  { value: 'failed', label: 'Failed', filter: 'failed' },
  { value: 'skipped', label: 'Skipped', filter: 'filtered' },
]

const dateFilters: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

interface TradeLogProps {
  trades: Trade[]
  traders: Trader[]
  page: number
  totalTrades: number
  pageSize: number
  onPageChange: (page: number) => void
}

export default function TradeLog({ trades, traders, page, totalTrades, pageSize, onPageChange }: TradeLogProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true },
  ])
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const traderLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of traders) {
      map[t.address.toLowerCase()] = t.label || t.bucket
    }
    return map
  }, [traders])

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const dateFiltered = useMemo(() => {
    if (dateFilter === 'all') return trades
    const now = Date.now()
    const cutoffs: Record<string, number> = {
      today: new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
      '7d': now - 7 * 24 * 60 * 60 * 1000,
      '30d': now - 30 * 24 * 60 * 60 * 1000,
    }
    const cutoff = cutoffs[dateFilter] ?? 0
    return trades.filter(t => t.timestamp && new Date(t.timestamp).getTime() >= cutoff)
  }, [trades, dateFilter])

  const searchFiltered = useMemo(() => {
    if (!debouncedSearch) return dateFiltered
    const q = debouncedSearch.toLowerCase()
    return dateFiltered.filter(t => {
      const label = traderLabels[t.trader_address?.toLowerCase() ?? ''] ?? ''
      return (
        t.market_name?.toLowerCase().includes(q) ||
        t.trader_address?.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        t.side?.toLowerCase().includes(q) ||
        t.bucket?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      )
    })
  }, [dateFiltered, debouncedSearch, traderLabels])

  const counts: Record<string, number> = {
    all: searchFiltered.length,
    executed: searchFiltered.filter(t => t.status === 'executed').length,
    simulated: searchFiltered.filter(t => t.status === 'simulated').length,
    blocked: searchFiltered.filter(t => t.status === 'risk_blocked').length,
    failed: searchFiltered.filter(t => t.status === 'failed').length,
    skipped: searchFiltered.filter(t => t.status === 'filtered').length,
  }

  const filtered = activeTab === 'all'
    ? searchFiltered
    : searchFiltered.filter(t => t.status === tabs.find(tab => tab.value === activeTab)?.filter)

  const columns = useMemo(() => getTradeColumns(traderLabels), [traderLabels])

  if (!trades.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Trade Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-sm text-muted-foreground">
            No trades recorded yet. Trades will appear here once the bot starts executing.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Trade Log</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => downloadExport('trades')}>
                Export CSV
              </Button>
            </div>
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search trades..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-0.5">
              {dateFilters.map(df => (
                <button
                  key={df.value}
                  onClick={() => setDateFilter(df.value)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    dateFilter === df.value
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {df.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-auto rounded-md border border-border">
          <DataTable
            columns={columns}
            data={filtered}
            sorting={sorting}
            onSortingChange={setSorting as (updater: SortingState | ((prev: SortingState) => SortingState)) => void}
          />
        </div>
        {totalTrades > pageSize && (
          <div className="flex items-center justify-between pt-3 border-t mt-3">
            <span className="text-xs text-muted-foreground">
              Page {page} of {Math.ceil(totalTrades / pageSize)} ({totalTrades} trades)
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= Math.ceil(totalTrades / pageSize)}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
