import { useState, useEffect, useCallback } from 'react'
import { getStats, getTrades, getTraders, getConfig } from '../api'

export interface StatsData {
  equity?: number
  dryRun?: boolean
  bot?: { state: string; cycleCount?: number; uptime?: number; consecutiveErrors?: number }
  risk?: Record<string, any>
  positions?: Position[]
  stats?: {
    totalPnl?: number
    wins?: number
    losses?: number
    total?: number
    profitFactor?: number
    dailyPnl?: { day: string; pnl: number; trades?: number }[]
    byBucket?: { bucket: string; pnl: number; count: number }[]
    byTrader?: { trader_address: string; count: number; pnl: number }[]
    byMarket?: { market_name: string; count: number; pnl: number }[]
    resolvedTrades?: { timestamp: string; pnl: number }[]
    recentSnapshots?: {
      timestamp: string
      equity: number
      open_positions: number
      total_exposure: number
      daily_pnl: number
      total_pnl: number
    }[]
  }
  pollInterval?: number
}

export interface Trader {
  address: string
  bucket: string
  enabled: boolean
  multiplier: number
  maxTrade: number
  label?: string
  addedAt?: string
}

export interface Trade {
  timestamp: string
  trader_address: string
  bucket: string
  market_name: string
  side: string
  price: number
  size_usd: number
  status: string
  pnl?: number
  resolved?: number
  notes?: string
}

export interface Position {
  id: number
  market_id: string
  token_id: string
  side: string
  entry_price: number
  size_usd: number
  current_price: number
  unrealized_pnl: number
  trader_address: string
  bucket: string
  opened_at: string
  status: string
}

const PAGE_SIZE = 25

export function usePolling(onUnauthorized: () => void) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [traders, setTraders] = useState<Trader[]>([])
  const [config, setConfig] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalTrades, setTotalTrades] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        getStats(),
        getTrades(page, PAGE_SIZE),
        getTraders(),
        getConfig(),
      ])

      // Check for 401 in any rejected result
      for (const r of results) {
        if (r.status === 'rejected' && r.reason?.message === 'Unauthorized') {
          localStorage.removeItem('bot_token')
          localStorage.removeItem('bot_csrf')
          onUnauthorized()
          return
        }
      }

      // Update state for each successful result independently
      if (results[0].status === 'fulfilled') setStats(results[0].value)
      if (results[1].status === 'fulfilled') {
        const tradesRes = results[1].value
        const tradesList = Array.isArray(tradesRes) ? tradesRes : tradesRes.trades
        setTrades(Array.isArray(tradesList) ? tradesList : [])
        setTotalTrades(Array.isArray(tradesRes) ? tradesRes.length : (tradesRes.total || 0))
      }
      if (results[2].status === 'fulfilled') setTraders(results[2].value.traders || [])
      if (results[3].status === 'fulfilled') setConfig(results[3].value)

      // Only show error if ALL failed
      const allFailed = results.every(r => r.status === 'rejected')
      setError(allFailed ? 'Failed to fetch data' : '')

      // Track last successful update if at least one request succeeded
      if (!allFailed) setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized, page])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  return { stats, trades, traders, config, error, loading, refresh: fetchData, page, setPage, totalTrades, pageSize: PAGE_SIZE, lastUpdated }
}
