import { useState, useEffect, useCallback } from 'react'
import { getStats, getTrades, getTraders, getConfig } from '../api'

export interface StatsData {
  equity?: number
  dryRun?: boolean
  bot?: { state: string; cycleCount?: number; uptime?: number; consecutiveErrors?: number }
  risk?: Record<string, number>
  stats?: {
    totalPnl?: number
    wins?: number
    losses?: number
    total?: number
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
  notes?: string
}

export function usePolling(onUnauthorized: () => void) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [traders, setTraders] = useState<Trader[]>([])
  const [config, setConfig] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, tradesRes, tradersRes, configRes] = await Promise.all([
        getStats(),
        getTrades(100),
        getTraders(),
        getConfig(),
      ])
      setStats(statsRes)
      setTrades(Array.isArray(tradesRes) ? tradesRes : [])
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
  }, [onUnauthorized])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  return { stats, trades, traders, config, error, loading, refresh: fetchData }
}
