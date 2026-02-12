import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getAuditLog, downloadExport } from '@/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  login: 'info',
  pause: 'warning',
  resume: 'profit',
  'emergency-stop': 'loss',
  settings_update: 'secondary',
  trader_add: 'profit',
  trader_remove: 'loss',
  trader_update: 'secondary',
}

export default function ActivityView() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuditLog()
      .then(data => setEntries(Array.isArray(data) ? data : data.entries || []))
      .catch(() => setEntries([]))
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
            <ScrollArea className="h-[500px]">
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
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
