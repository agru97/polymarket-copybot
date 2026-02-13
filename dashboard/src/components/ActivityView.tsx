import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getAuditLog, downloadExport } from '@/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fadeInUp, defaultTransition } from '@/lib/animations'

interface AuditEntry {
  timestamp: string
  action: string
  actor?: string
  details?: string
  ip?: string
}

const actionVariant: Record<string, 'profit' | 'warning' | 'loss' | 'info' | 'secondary'> = {
  login_success: 'info',
  login_failed: 'loss',
  bot_pause: 'warning',
  bot_resume: 'profit',
  bot_emergency_stop: 'loss',
  settings_change: 'secondary',
  trader_add: 'profit',
  trader_remove: 'loss',
  trader_update: 'secondary',
}

export default function ActivityView() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getAuditLog()
      .then(data => setEntries(Array.isArray(data) ? data : data.entries || []))
      .catch((err) => {
        if (!(err instanceof Error && err.message === 'Unauthorized')) {
          setError('Failed to load activity log')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={defaultTransition}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">Activity Log</CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => downloadExport('activity')}>
              Export CSV
            </Button>
          </div>
          <CardDescription>Recent actions and events</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No activity recorded yet
            </div>
          ) : (
            <div className="h-[500px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Time</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Action</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Actor</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-semibold">Details</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-semibold">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={actionVariant[entry.action] ?? 'secondary'}
                          className="text-[10px]"
                        >
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{entry.actor || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                        {entry.details || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {entry.ip || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
