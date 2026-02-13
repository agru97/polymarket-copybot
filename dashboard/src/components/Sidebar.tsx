import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { LayoutDashboard, Users, Settings, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'

export type View = 'dashboard' | 'traders' | 'settings' | 'activity'

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'traders', label: 'Traders', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'activity', label: 'Activity', icon: ScrollText },
]

export default function Sidebar({
  activeView,
  onViewChange,
}: {
  activeView: View
  onViewChange: (view: View) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r bg-card/50 transition-all duration-200',
        expanded ? 'w-[200px]' : 'w-14'
      )}
    >
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 flex flex-col gap-1 p-2 pt-3">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeView === id
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onViewChange(id)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={label}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-primary" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    {expanded && <span className="truncate">{label}</span>}
                  </button>
                </TooltipTrigger>
                {!expanded && (
                  <TooltipContent side="right">{label}</TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </nav>
      </TooltipProvider>

      <div className="p-2 border-t">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-full"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}
