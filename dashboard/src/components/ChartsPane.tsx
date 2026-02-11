import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import EquityCurveChart from './charts/EquityCurveChart'
import DailyPnLChart from './charts/DailyPnLChart'
import BucketPnLChart from './charts/BucketPnLChart'
import TraderPnLChart from './charts/TraderPnLChart'
import { Skeleton } from '@/components/ui/skeleton'

type ChartTab = 'equity' | 'daily' | 'bucket' | 'trader'

interface Stats {
  totalPnl?: number
  wins?: number
  losses?: number
  total?: number
  dailyPnl?: { day: string; pnl: number; trades?: number }[]
  byBucket?: { bucket: string; pnl: number; count: number }[]
  byTrader?: { trader_address: string; count: number; pnl: number }[]
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
  const [tab, setTab] = useState<ChartTab>('equity')

  if (!stats) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-medium">Charts</CardTitle>
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as ChartTab)}
            className="justify-start"
            size="sm"
          >
            <ToggleGroupItem value="equity" className="text-xs px-3">Equity Curve</ToggleGroupItem>
            <ToggleGroupItem value="daily" className="text-xs px-3">Daily P&L</ToggleGroupItem>
            <ToggleGroupItem value="bucket" className="text-xs px-3">By Bucket</ToggleGroupItem>
            <ToggleGroupItem value="trader" className="text-xs px-3">By Trader</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {tab === 'equity' && <EquityCurveChart snapshots={stats.recentSnapshots || []} />}
        {tab === 'daily' && <DailyPnLChart data={stats.dailyPnl || []} />}
        {tab === 'bucket' && <BucketPnLChart data={stats.byBucket || []} />}
        {tab === 'trader' && <TraderPnLChart data={stats.byTrader || []} />}
      </CardContent>
    </Card>
  )
}
