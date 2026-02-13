import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getStats } from './api'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('bot_token')
    if (!token) {
      setLoading(false)
      return
    }
    getStats()
      .then(() => setAuthenticated(true))
      .catch((err) => {
        // Only clear credentials on explicit 401, not network errors
        if (err instanceof Error && err.message === 'Unauthorized') {
          localStorage.removeItem('bot_token')
          localStorage.removeItem('bot_csrf')
        } else {
          // Network error — keep token, assume valid
          setAuthenticated(true)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const onLogin = () => setAuthenticated(true)
  const onLogout = () => setAuthenticated(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <svg className="h-5 w-5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {!authenticated ? (
          <Login key="login" onLogin={onLogin} />
        ) : (
          <Dashboard key="dashboard" onLogout={onLogout} />
        )}
      </AnimatePresence>
    </ErrorBoundary>
  )
}

export default App
