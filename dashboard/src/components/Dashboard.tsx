import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import { usePolling } from '@/hooks/usePolling'
import { useTheme } from '@/hooks/useTheme'
import StatusBar from './StatusBar'
import Sidebar, { type View } from './Sidebar'
import BottomTabBar from './BottomTabBar'
import DashboardView from './DashboardView'
import TradersView from './TradersView'
import SettingsView from './SettingsView'
import ActivityView from './ActivityView'
import { pageTransition, defaultTransition } from '@/lib/animations'

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [activeView, setActiveView] = useState<View>('dashboard')
  const { theme, toggleTheme } = useTheme()
  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem('bot_token')
    localStorage.removeItem('bot_csrf')
    onLogout()
  }, [onLogout])
  const { stats, trades, traders, error, refresh, page, setPage, totalTrades, pageSize } = usePolling(handleUnauthorized)

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView stats={stats} trades={trades} traders={traders} onAction={refresh} page={page} totalTrades={totalTrades} pageSize={pageSize} onPageChange={setPage} />
      case 'traders':
        return <TradersView traders={traders} stats={stats} onUpdate={refresh} />
      case 'settings':
        return <SettingsView onSave={refresh} />
      case 'activity':
        return <ActivityView />
      default:
        return null
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <StatusBar
        stats={stats}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={refresh}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={defaultTransition}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomTabBar activeView={activeView} onViewChange={setActiveView} />
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'glass-strong',
        }}
      />
    </div>
  )
}
