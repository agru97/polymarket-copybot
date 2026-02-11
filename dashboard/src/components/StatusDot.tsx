import { cn } from '@/lib/utils'

const colors: Record<string, string> = {
  executed: 'bg-profit',
  simulated: 'bg-info',
  risk_blocked: 'bg-warning',
  failed: 'bg-loss',
  no_position: 'bg-muted-foreground',
}

export default function StatusDot({ status }: { status?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        colors[status ?? ''] || 'bg-muted-foreground'
      )}
    />
  )
}
