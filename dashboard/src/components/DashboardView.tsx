import { motion } from 'framer-motion'
import { fadeInUp, staggerChildren, defaultTransition } from '@/lib/animations'
import KPICards from './KPICards'
import ChartsPane from './ChartsPane'
import RiskPanel from './RiskPanel'
import OpenPositions from './OpenPositions'
import TradeLog from './TradeLog'
import type { StatsData, Trade, Trader } from '@/hooks/usePolling'

export default function DashboardView({
  stats,
  trades,
  traders,
  onAction,
  page,
  totalTrades,
  pageSize,
  onPageChange,
}: {
  stats: StatsData | null
  trades: Trade[]
  traders: Trader[]
  onAction: () => void
  page: number
  totalTrades: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  return (
    <motion.div
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <KPICards stats={stats} risk={stats?.risk} />
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <ChartsPane stats={stats?.stats} />
          </div>
          <div className="lg:col-span-2">
            <RiskPanel stats={stats} onAction={onAction} />
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <OpenPositions positions={stats?.positions ?? []} />
      </motion.div>

      <motion.div variants={fadeInUp} transition={defaultTransition}>
        <TradeLog trades={trades} traders={traders} page={page} totalTrades={totalTrades} pageSize={pageSize} onPageChange={onPageChange} />
      </motion.div>
    </motion.div>
  )
}
