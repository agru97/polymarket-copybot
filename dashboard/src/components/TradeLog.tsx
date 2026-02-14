import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { getTradeColumns } from '@/components/trades/trade-columns'
import { downloadExport } from '@/api'
import type { Trade, Trader, TradeFilters, StatusCounts } from '@/hooks/usePolling'
import type { SortingState } from '@tanstack/react-table'

type TabValue = 'all' | 'executed' | 'simulated' | 'blocked' | 'failed' | 'skipped'
type DateFilter = 'all' | 'today' | '7d' | '30d'

const tabs: { value: TabValue; label: string; statusKey?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'executed', label: 'Executed', statusKey: 'executed' },
  { value: 'simulated', label: 'Simulated', statusKey: 'simulated' },
  { value: 'blocked', label: 'Blocked', statusKey: 'risk_blocked' },
  { value: 'failed', label: 'Failed', statusKey: 'failed' },
  { value: 'skipped', label: 'Skipped', statusKey: 'filtered' },
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
  statusCounts: StatusCounts
  tradeFilters: TradeFilters
  onTradeFiltersChange: (filters: TradeFilters) => void
}

export default function TradeLog({
  trades, traders, page, totalTrades, pageSize, onPageChange,
  statusCounts, tradeFilters, onTradeFiltersChange,
}: TradeLogProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true },
  ])
  const [searchInput, setSearchInput] = useState('')

  const activeTab = useMemo<TabValue>(() => {
    const status = tradeFilters.status
    if (!status) return 'all'
    const tab = tabs.find(t => t.statusKey === status)
    return tab?.value ?? 'all'
  }, [tradeFilters.status])

  const dateFilter = useMemo<DateFilter>(() => {
    return (tradeFilters.dateRange as DateFilter) || 'all'
  }, [tradeFilters.dateRange])

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onPageChange(1)
      onTradeFiltersChange({ ...tradeFilters, search: value || undefined })
    }, 400)
  }, [tradeFilters, onTradeFiltersChange, onPageChange])
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const handleTabChange = useCallback((tab: TabValue) => {
    const statusKey = tabs.find(t => t.value === tab)?.statusKey
    onPageChange(1)
    onTradeFiltersChange({ ...tradeFilters, status: statusKey })
  }, [tradeFilters, onTradeFiltersChange, onPageChange])

  const handleDateChange = useCallback((df: DateFilter) => {
    onPageChange(1)
    onTradeFiltersChange({ ...tradeFilters, dateRange: df === 'all' ? undefined : df })
  }, [tradeFilters, onTradeFiltersChange, onPageChange])

  const traderLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of traders) {
      map[t.address.toLowerCase()] = t.label || t.bucket
    }
    return map
  }, [traders])

  const getCount = (tab: TabValue): number => {
    if (tab === 'all') return statusCounts.all || 0
    const statusKey = tabs.find(t => t.value === tab)?.statusKey
    if (!statusKey) return 0
    return statusCounts[statusKey] || 0
  }

  const columns = useMemo(() => getTradeColumns(traderLabels), [traderLabels])

  if (!trades.length && !tradeFilters.status && !tradeFilters.search && !tradeFilters.dateRange) {
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
            <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Filter trades by status">
              {tabs.map(tab => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  onClick={() => handleTabChange(tab.value)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTab === tab.value
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {tab.label}
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-[18px] justify-center">
                    {getCount(tab.value)}
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
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                aria-label="Search trades"
                className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-0.5" role="group" aria-label="Filter trades by date range">
              {dateFilters.map(df => (
                <button
                  key={df.value}
                  aria-pressed={dateFilter === df.value}
                  onClick={() => handleDateChange(df.value)}
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
        <div className="max-h-[calc(100vh-420px)] min-h-[300px] overflow-auto rounded-md border border-border">
          <DataTable
            columns={columns}
            data={trades}
            sorting={sorting}
            onSortingChange={setSorting as (updater: SortingState | ((prev: SortingState) => SortingState)) => void}
          />
        </div>
        <Pagination page={page} totalItems={totalTrades} pageSize={pageSize} onPageChange={onPageChange} />
      </CardContent>
    </Card>
  )
}

function Pagination({ page, totalItems, pageSize, onPageChange }: {
  page: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  // Build visible page numbers: always show first, last, current, and neighbors
  const pages: (number | 'ellipsis')[] = []
  const addPage = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p)
  }

  addPage(1)
  if (page > 3) pages.push('ellipsis')
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
    addPage(i)
  }
  if (page < totalPages - 2) pages.push('ellipsis')
  addPage(totalPages)

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
      <span className="text-xs text-muted-foreground tabular-nums">
        {from}–{to} of {totalItems}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground select-none">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`h-7 min-w-[28px] px-1.5 rounded-md text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
