import { motion } from 'framer-motion'
import { fadeInUp, staggerChildren, defaultTransition } from '@/lib/animations'
import KPICards from './KPICards'
import ChartsPane from './ChartsPane'
import RiskPanel from './RiskPanel'
import TradeLog from './TradeLog'
import type { StatsData, Trade } from '@/hooks/usePolling'

export default function DashboardView({
  stats,
  trades,
  onAction,
}: {
  stats: StatsData | null
  trades: Trade[]
  onAction: () => void
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
        <TradeLog trades={trades} />
      </motion.div>
    </motion.div>
  )
}
