import React, { useState, useEffect } from 'react'
import axios from 'axios'
import Header from './Header'
import FearGreedIndex from './FearGreedIndex'
import PredictionsPanel from './PredictionsPanel'
import AlertsPanel from './AlertsPanel'
import AnalyzerPanel from './AnalyzerPanel'
import ConfigModal from './ConfigModal'
import Toast from './Toast'
import TradingChart from './TradingChart'

interface DashboardData {
  fearGreed?: any
  health?: any
}

const COINS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD', 'XRP-USD']

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'predictions' | 'analyzer' | 'alerts'>('overview')
  const [configStatus, setConfigStatus] = useState<any[]>([])
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USD')
  const [candles, setCandles] = useState<any[]>([])
  const [candleLoading, setCandleLoading] = useState(false)
  const [liveTick, setLiveTick] = useState<any>(null)

  const showToast = (msg: string, type: 'success' | 'error') => setToast({ msg, type })

  const fetchCandles = async (symbol: string) => {
    setCandleLoading(true)
    try {
      const res = await axios.get(`/api/tickers/${symbol}/candles?interval=1h&limit=100`)
      setCandles(res.data.data || [])
    } catch {
      setCandles([])
    } finally {
      setCandleLoading(false)
    }
  }

  const fetchData = async () => {
    try {
      const [fgRes, healthRes, configRes] = await Promise.allSettled([
        axios.get('/api/fear-greed/latest'),
        axios.get('/api/health'),
        axios.get('/api/config/status'),
      ])
      if (fgRes.status === 'fulfilled')     setData(d => ({ ...d, fearGreed: fgRes.value.data.data }))
      if (healthRes.status === 'fulfilled') setData(d => ({ ...d, health: healthRes.value.data.data }))
      if (configRes.status === 'fulfilled') {
        const st = configRes.value.data?.data?.status
        if (Array.isArray(st)) setConfigStatus(st)
      }
    } catch { /* network error — silently retry */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData()
    fetchCandles(selectedSymbol)
    const t1 = setInterval(fetchData, 30_000)
    const t2 = setInterval(() => setCurrentTime(new Date()), 1_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [selectedSymbol])   // re-run when coin changes

  useEffect(() => {
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
    const ws = new WebSocket(`ws://${wsHost}/ws/tickers`);
    ws.onmessage = (event) => {
      try {
        const tick = JSON.parse(event.data);
        setLiveTick(tick);
      } catch (e) {}
    }
    return () => ws.close();
  }, []);

  const alchemySet = configStatus.some(k => k.id === 'ALCHEMY_PROJECT_ID' && k.isSet)

  return (
    <div>
      <Header health={data.health} onOpenSettings={() => setIsConfigOpen(true)} />

      <main className="main-layout">
        <div className="dashboard-grid">

          {/* ── Hero Banner ─────────────────────────────────────────────── */}
          <div className="col-12 glass-card animate-fade-in flex-between"
               style={{ padding: '28px 44px', borderLeft: '3px solid var(--primary)' }}>
            <div className="flex-col gap-1">
              <h1 className="font-outfit text-gradient-primary" style={{ fontSize: '2.2rem', fontWeight: 900 }}>
                DARK SIDE <span style={{ color: 'var(--primary)' }}>CRYPTO</span>
              </h1>
              <p className="label-caps" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--primary)' }}>{currentTime.toLocaleTimeString()}</span>
                <span style={{ opacity: 0.15 }}>│</span>
                <span>Imperial Intelligence Network · Zero-Lag Feed</span>
              </p>
            </div>

            <div className="flex gap-5">
              <div className="text-right">
                <p className="label-caps" style={{ marginBottom: '6px' }}>Psych-Index</p>
                <p className="stat-glow" style={{ fontSize: '1.8rem', color: 'var(--primary)' }}>
                  {loading ? '—' : (data.fearGreed?.composite_score ?? '—')}
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-ghost)', marginLeft: 4 }}>/100</span>
                </p>
              </div>
              <div className="text-right" style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '28px' }}>
                <p className="label-caps" style={{ marginBottom: '6px' }}>Node Status</p>
                <div className="flex gap-2" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div className="live-dot" />
                  <span style={{ fontWeight: 900, letterSpacing: '0.1em' }}>DOMINANT</span>
                </div>
              </div>
              <div className="text-right" style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '28px' }}>
                <p className="label-caps" style={{ marginBottom: '6px' }}>Whale Net</p>
                <div className="flex gap-2" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div className={`live-dot ${alchemySet ? '' : 'red'}`} />
                  <span style={{ fontWeight: 900, letterSpacing: '0.1em', color: alchemySet ? 'var(--success)' : 'var(--primary)' }}>
                    {alchemySet ? 'SYNCED' : 'SETUP↗'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart Column ────────────────────────────────────────────── */}
          <div className="col-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="glass-card" style={{ padding: '32px' }}>
              {/* Coin Selector */}
              <div className="flex gap-2" style={{ marginBottom: '24px', flexWrap: 'wrap' }}>
                {COINS.map(s => (
                  <button key={s}
                    className={`btn-antigravity ${selectedSymbol === s ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '7px 14px', fontSize: '0.63rem' }}
                    onClick={() => setSelectedSymbol(s)}>
                    {s.split('-')[0]}
                  </button>
                ))}
                {candleLoading && <span className="label-caps" style={{ color: 'var(--primary)', alignSelf: 'center' }}>LOADING…</span>}
              </div>

              <TradingChart data={candles} symbol={selectedSymbol} liveTick={liveTick} />
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <div className="col-4 flex-col gap-4" style={{ animationDelay: '0.15s' }}>
            {/* Fear & Greed */}
            <div className="glass-card animate-fade-in">
              <FearGreedIndex data={data.fearGreed} loading={loading} />
            </div>

            {/* Operations Panel */}
            <div className="glass-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <h3 className="font-outfit text-gradient-primary" style={{ marginBottom: '20px', fontSize: '0.9rem' }}>
                Operations
              </h3>
              <div className="ticker-row">
                <span className="label-caps">Dark Harvest</span>
                <span className="neon-badge">ACTIVE</span>
              </div>
              <div className="ticker-row">
                <span className="label-caps">Arkham Intelligence</span>
                <a href="https://platform.arkhamintelligence.com" target="_blank" rel="noreferrer"
                   style={{ textDecoration: 'none' }}>
                  <span className="badge-glow" style={{ cursor: 'pointer' }}>OPEN ↗</span>
                </a>
              </div>
              <div className="ticker-row">
                <span className="label-caps">ML Inference</span>
                <span className="badge-glow">READY</span>
              </div>
              <div className="ticker-row">
                <span className="label-caps">Whale Tracker</span>
                <span className={alchemySet ? 'trend-up' : ''} style={{ fontSize: '0.65rem', fontWeight: 900 }}>
                  {alchemySet ? 'SYNCED' : 'NEEDS KEY'}
                </span>
              </div>
              <div className="ticker-row">
                <span className="label-caps">Orderflow</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--success)' }}>OPTIMAL</span>
              </div>
              {!alchemySet && (
                <button className="btn-antigravity btn-primary"
                  style={{ width: '100%', marginTop: '20px' }}
                  onClick={() => setIsConfigOpen(true)}>
                  ⚡ Configure Keys
                </button>
              )}
            </div>
          </div>

          {/* ── Intelligence Terminal ────────────────────────────────────── */}
          <div className="col-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="glass-card" style={{ minHeight: '550px', padding: '32px' }}>
              {/* Tab Bar */}
              <div className="flex gap-3" style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }}>
                {(['overview', 'predictions', 'analyzer', 'alerts'] as const).map(tab => (
                  <button key={tab}
                    className={`btn-antigravity ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab(tab)}>
                    {tab === 'overview' ? '📡 Signal Terminal' : tab === 'predictions' ? '🤖 ML Intelligence' : tab === 'analyzer' ? '⚖️ Technical Analyzer' : '🚨 Alert Matrix'}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="tab-pane">
                {activeTab === 'overview' && (
                  <div className="animate-fade-in">
                    <p className="text-dim" style={{ marginBottom: '24px', fontSize: '0.85rem' }}>
                      Streaming real-time orderflow, whale movements, and sentiment signals…
                    </p>
                    <AlertsPanel limit={6} />
                  </div>
                )}
                {activeTab === 'predictions' && <PredictionsPanel />}
                {activeTab === 'analyzer'    && <AnalyzerPanel />}
                {activeTab === 'alerts'      && <AlertsPanel />}
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '48px', borderTop: '1px solid var(--border-glass)' }}>
        <p className="label-caps" style={{ opacity: 0.3 }}>© 2026 Dark Side Crypto · Imperial Intelligence Network</p>
      </footer>

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        configs={configStatus}
        onConfigsUpdated={fetchData}
        onShowToast={showToast}
      />

      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

export default Dashboard
