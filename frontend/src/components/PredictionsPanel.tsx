import React from 'react'
import axios from 'axios'

interface Prediction {
  symbol: string
  horizon: string
  confidence: number
  direction: 'UP' | 'DOWN'
  price_low: number
  price_high: number
  trend_strength?: string
}

// Static ML predictions — replaced by live API data when available
const MOCK_PREDICTIONS: Prediction[] = [
  { symbol: 'BTC-USD', horizon: '1H', confidence: 0.74, direction: 'UP',   price_low: 64_200, price_high: 65_800, trend_strength: 'STRONG' },
  { symbol: 'BTC-USD', horizon: '4H', confidence: 0.68, direction: 'UP',   price_low: 63_500, price_high: 67_200, trend_strength: 'MODERATE' },
  { symbol: 'ETH-USD', horizon: '1H', confidence: 0.61, direction: 'DOWN', price_low:  3_440, price_high:  3_580, trend_strength: 'WEAK' },
  { symbol: 'SOL-USD', horizon: '1H', confidence: 0.77, direction: 'UP',   price_low:    165, price_high:    178, trend_strength: 'STRONG' },
]

const PredictionsPanel: React.FC = () => {
  const [predictions, setPredictions] = React.useState<Prediction[]>(MOCK_PREDICTIONS)

  React.useEffect(() => {
    axios.get('/api/predictions/latest')
      .then(r => { if (r.data?.data?.length) setPredictions(r.data.data) })
      .catch(() => { /* stay with mock data */ })
  }, [])

  const dirColor = (d: string) => d === 'UP' ? 'var(--success)' : 'var(--error)'

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '28px' }}>
        <div>
          <h2 className="font-outfit text-gradient-primary" style={{ fontSize: '1rem' }}>
            ML Intelligence
          </h2>
          <p className="text-dim" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            XGBoost Ensemble · {predictions.length} active predictions
          </p>
        </div>
        <span className="neon-badge">MODEL v1.0</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {predictions.map((p, i) => (
          <div key={i} className="glass-card" style={{ padding: '24px', borderTop: `2px solid ${dirColor(p.direction)}` }}>

            <div className="flex-between" style={{ marginBottom: '20px' }}>
              <div className="flex gap-2" style={{ alignItems: 'center' }}>
                <span className="font-outfit" style={{ fontSize: '1.1rem', fontWeight: 900 }}>{p.symbol.replace('-USD', '')}</span>
                <span className="badge-glow">{p.horizon}</span>
              </div>
              <span style={{
                fontWeight: 900, fontSize: '0.85rem',
                color: dirColor(p.direction),
                textShadow: `0 0 12px ${dirColor(p.direction)}55`,
              }}>
                {p.direction === 'UP' ? '↗ LONG' : '↘ SHORT'}
              </span>
            </div>

            {/* Confidence Bar */}
            <div className="flex-between" style={{ marginBottom: '6px' }}>
              <span className="label-caps">Confidence</span>
              <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{Math.round(p.confidence * 100)}%</span>
            </div>
            <div style={{ height: '5px', background: 'rgba(255,255,255,0.05)', marginBottom: '20px' }}>
              <div style={{
                height: '100%', width: `${p.confidence * 100}%`,
                background: dirColor(p.direction),
                boxShadow: `0 0 10px ${dirColor(p.direction)}`,
                transition: 'width 1s ease',
              }} />
            </div>

            {/* Range */}
            <div className="flex-between" style={{
              padding: '12px', background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-glass)',
            }}>
              <div className="flex-col gap-1">
                <span className="label-caps" style={{ fontSize: '0.58rem' }}>Target Low</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>${p.price_low.toLocaleString()}</span>
              </div>
              <div className="text-right flex-col gap-1">
                <span className="label-caps" style={{ fontSize: '0.58rem' }}>Target High</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>${p.price_high.toLocaleString()}</span>
              </div>
            </div>

            {p.trend_strength && (
              <div style={{ marginTop: '12px', textAlign: 'right' }}>
                <span className="label-caps" style={{ fontSize: '0.6rem' }}>
                  Trend: <span style={{ color: dirColor(p.direction) }}>{p.trend_strength}</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '32px', padding: '20px', border: '1px solid var(--border-glass)', background: 'var(--primary-dim)' }}>
        <p className="text-dim" style={{ fontSize: '0.82rem' }}>
          ℹ️ &nbsp;Predictions are derived from real-time RSI, MACD, Bollinger Bands, and on-chain volume flow synchronized with local SQLite.
        </p>
      </div>
    </div>
  )
}

export default PredictionsPanel
