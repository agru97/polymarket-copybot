import { Badge } from '@/components/ui/badge'

export default function BotStatusBadge({ state }: { state?: string }) {
  const variant = state === 'running' ? 'profit'
    : state === 'paused' ? 'warning'
    : state === 'stopped' ? 'loss'
    : 'secondary'

  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wider">
      {state || 'Unknown'}
    </Badge>
  )
}
