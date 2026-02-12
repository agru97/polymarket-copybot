import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  valueColor,
  sparkline,
}: {
  title: React.ReactNode
  value: string
  subtitle: React.ReactNode
  icon: React.ReactNode
  valueColor?: string
  sparkline?: React.ReactNode
}) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow duration-300">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-muted-foreground">{icon}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {title}
              </span>
            </div>
            <motion.div
              key={value}
              initial={{ opacity: 0.6, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={cn('text-2xl font-bold font-mono tabular-nums', valueColor)}
            >
              {value}
            </motion.div>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {sparkline && (
            <div className="w-16 h-8 opacity-70 group-hover:opacity-100 transition-opacity">
              {sparkline}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
