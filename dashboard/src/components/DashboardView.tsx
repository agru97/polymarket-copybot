import { motion } from 'framer-motion'
import { fadeInUp, staggerChildren, defaultTransition } from '@/lib/animations'
import KPICards from './KPICards'
import ChartsPane from './ChartsPane'
import RiskPanel from './RiskPanel'
import OpenPositions from './OpenPositions'
import TradeLog from './TradeLog'
import type { StatsData, Trade, Trader, TradeFilters, StatusCounts } from '@/hooks/usePolling'
import type { TimeRange } from './charts/TimeRangeSelector'

export default function DashboardView({
  stats,
  trades,
  traders,
  onAction,
  page,
  totalTrades,
  pageSize,
  onPageChange,
  statusCounts,
  tradeFilters,
  onTradeFiltersChange,
  chartRange,
  onChartRangeChange,
}: {
  stats: StatsData | null
  trades: Trade[]
  traders: Trader[]
  onAction: () => void
  page: number
  totalTrades: number
  pageSize: number
  onPageChange: (page: number) => void
  statusCounts: StatusCounts
  tradeFilters: TradeFilters
  onTradeFiltersChange: (filters: TradeFilters) => void
  chartRange: string
  onChartRangeChange: (range: string) => void
}) {
  const positions = stats?.positions ?? []
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0)

  return (
    <motion.div
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <KPICards stats={stats} risk={stats?.risk} unrealizedPnl={totalUnrealizedPnl} />
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <ChartsPane
              stats={stats?.stats}
              traders={traders}
              range={chartRange as TimeRange}
              onRangeChange={onChartRangeChange}
            />
          </div>
          <div className="lg:col-span-2">
            <RiskPanel stats={stats} onAction={onAction} />
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <OpenPositions positions={positions} />
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <TradeLog trades={trades} traders={traders} page={page} totalTrades={totalTrades} pageSize={pageSize} onPageChange={onPageChange} statusCounts={statusCounts} tradeFilters={tradeFilters} onTradeFiltersChange={onTradeFiltersChange} />
      </motion.div>
    </motion.div>
  )
}
