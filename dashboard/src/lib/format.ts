const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatUsd(n: number): string {
  return usdFormatter.format(n)
}

export function formatPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

export function formatCompact(n: number): string {
  return compactFormatter.format(n)
}

export function formatUptime(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export function formatSide(side?: string): { direction: string; outcome: string } {
  if (!side) return { direction: '', outcome: '—' }
  if (side.startsWith('CLOSE_')) return { direction: 'Close', outcome: side.slice(6) }
  if (side === 'SELL') return { direction: 'Sell', outcome: '' }
  return { direction: 'Buy', outcome: side }
}
