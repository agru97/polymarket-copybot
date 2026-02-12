import { useState, useEffect, useCallback } from 'react'
import { getStats, getTrades, getTraders, getConfig } from '../api'

export interface StatsData {
  equity?: number
  dryRun?: boolean
  bot?: { state: string; cycleCount?: number; uptime?: number; consecutiveErrors?: number }
  risk?: Record<string, any>
  stats?: {
    totalPnl?: number
    wins?: number
    losses?: number
    total?: number
    profitFactor?: number
    dailyPnl?: { day: string; pnl: number; trades?: number }[]
    byBucket?: { bucket: string; pnl: number; count: number }[]
    byTrader?: { trader_address: string; count: number; pnl: number }[]
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
  timestamp?: string
  trader_address?: string
  bucket?: string
  market_name?: string
  side?: string
  price?: number
  size_usd?: number
  status?: string
  pnl?: number
  resolved?: number
  notes?: string
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

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, tradesRes, tradersRes, configRes] = await Promise.all([
        getStats(),
        getTrades(page, PAGE_SIZE),
        getTraders(),
        getConfig(),
      ])
      setStats(statsRes)
      const tradesList = Array.isArray(tradesRes) ? tradesRes : tradesRes.trades
      setTrades(Array.isArray(tradesList) ? tradesList : [])
      setTotalTrades(Array.isArray(tradesRes) ? tradesRes.length : (tradesRes.total || 0))
      setTraders(tradersRes.traders || [])
      setConfig(configRes)
      setError('')
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        localStorage.removeItem('bot_token')
        localStorage.removeItem('bot_csrf')
        onUnauthorized()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch')
      }
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized, page])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  return { stats, trades, traders, config, error, loading, refresh: fetchData, page, setPage, totalTrades, pageSize: PAGE_SIZE }
}
