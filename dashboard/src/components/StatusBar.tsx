import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RefreshCw, MoreVertical, Sun, Moon, LogOut } from 'lucide-react'
import { formatUptime } from '@/lib/format'
import type { StatsData } from '@/hooks/usePolling'
import type { Theme } from '@/hooks/useTheme'

export default function StatusBar({
  stats,
  theme,
  onToggleTheme,
  onRefresh,
  onLogout,
}: {
  stats: StatsData | null
  theme: Theme
  onToggleTheme: () => void
  onRefresh: () => void
  onLogout: () => void
}) {
  const [time, setTime] = useState(new Date().toLocaleTimeString())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  const isLive = stats?.dryRun === false
  const botState = stats?.bot?.state

  return (
    <header className="sticky top-0 z-50 glass-strong h-11 flex items-center px-4 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-semibold tracking-tight whitespace-nowrap">
          Polymarket Copy Bot
        </span>
        <Badge
          variant={isLive ? 'destructive' : 'secondary'}
          className="text-[10px] uppercase tracking-wider"
        >
          {isLive ? 'LIVE' : 'PAPER'}
        </Badge>
      </div>

      <div className="flex-1 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        {botState === 'running' && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-profit" />
            </span>
            <span className="hidden sm:inline">Connected</span>
          </span>
        )}
        <span className="font-mono tabular-nums">
          Cycle #{stats?.bot?.cycleCount ?? '—'}
        </span>
        <span className="hidden sm:inline font-mono tabular-nums">
          {formatUptime(stats?.bot?.uptime)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs font-mono tabular-nums text-muted-foreground hidden sm:block mr-2">
          {time}
        </span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { localStorage.removeItem('bot_token'); localStorage.removeItem('bot_csrf'); onLogout() }} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
