import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Settings, ScrollText } from 'lucide-react'
import type { View } from './Sidebar'

const tabs: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'traders', label: 'Traders', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'activity', label: 'Activity', icon: ScrollText },
]

export default function BottomTabBar({
  activeView,
  onViewChange,
}: {
  activeView: View
  onViewChange: (view: View) => void
}) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t">
      <div className="flex h-14">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeView === id
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
