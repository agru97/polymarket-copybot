import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { downloadExport } from '@/api'
import EquityCurveChart from './charts/EquityCurveChart'
import DailyPnLChart from './charts/DailyPnLChart'
import BucketPnLChart from './charts/BucketPnLChart'
import TraderPnLChart from './charts/TraderPnLChart'
import MarketPnLChart from './charts/MarketPnLChart'
import WinRateChart from './charts/WinRateChart'
import TimeRangeSelector, { type TimeRange } from './charts/TimeRangeSelector'
import { Skeleton } from '@/components/ui/skeleton'

type SecondaryTab = 'daily' | 'bucket' | 'trader' | 'market' | 'winrate'

interface Stats {
  totalPnl?: number
  wins?: number
  losses?: number
  total?: number
  dailyPnl?: { day: string; pnl: number; trades?: number }[]
  byBucket?: { bucket: string; pnl: number; count: number }[]
  byTrader?: { trader_address: string; count: number; pnl: number }[]
  byMarket?: { market_name: string; count: number; pnl: number }[]
  resolvedTrades?: { timestamp: string; pnl: number }[]
  recentSnapshots?: {
    timestamp: string
    equity: number
    open_positions: number
    total_exposure: number
    daily_pnl: number
    total_pnl: number
  }[]
}

export default function ChartsPane({ stats }: { stats?: Stats | null }) {
  const [range, setRange] = useState<TimeRange>('7d')
  const [tab, setTab] = useState<SecondaryTab>('daily')

  if (!stats) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[440px] w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Charts</CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => downloadExport('performance')}>
              Export CSV
            </Button>
          </div>
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Equity curve — always visible */}
        <EquityCurveChart snapshots={stats.recentSnapshots || []} range={range} height={220} />

        {/* Secondary charts — tabbed */}
        <div>
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as SecondaryTab)}
            className="justify-start mb-3"
            size="sm"
          >
            <ToggleGroupItem value="daily" className="text-xs px-3">Daily P&L</ToggleGroupItem>
            <ToggleGroupItem value="bucket" className="text-xs px-3">By Bucket</ToggleGroupItem>
            <ToggleGroupItem value="trader" className="text-xs px-3">By Trader</ToggleGroupItem>
            <ToggleGroupItem value="market" className="text-xs px-3">By Market</ToggleGroupItem>
            <ToggleGroupItem value="winrate" className="text-xs px-3">Win Rate</ToggleGroupItem>
          </ToggleGroup>

          {tab === 'daily' && <DailyPnLChart data={stats.dailyPnl || []} range={range} height={200} />}
          {tab === 'bucket' && <BucketPnLChart data={stats.byBucket || []} />}
          {tab === 'trader' && <TraderPnLChart data={stats.byTrader || []} />}
          {tab === 'market' && <MarketPnLChart data={stats.byMarket || []} />}
          {tab === 'winrate' && <WinRateChart data={stats.resolvedTrades || []} />}
        </div>
      </CardContent>
    </Card>
  )
}
