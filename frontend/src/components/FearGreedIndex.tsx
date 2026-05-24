import React from 'react'

interface Props {
  data?: {
    composite_score?: number
    value?: number
    classification?: string
    timestamp?: string
  }
  loading?: boolean
}

const getColor = (v: number) => {
  if (v < 25) return 'var(--error)'
  if (v < 45) return 'var(--warning)'
  if (v < 55) return 'var(--text-dim)'
  if (v < 75) return 'var(--success)'
  return 'var(--primary)'
}

const getLabel = (v: number) => {
  if (v < 25) return '😨 Extreme Fear'
  if (v < 45) return '😟 Fear'
  if (v < 55) return '😐 Neutral'
  if (v < 75) return '😊 Greed'
  return '🤑 Extreme Greed'
}

const FearGreedIndex: React.FC<Props> = ({ data, loading }) => {
  const raw   = data?.composite_score ?? data?.value ?? 50
  const value = Math.round(raw)
  const color = getColor(value)

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex-between" style={{ marginBottom: '20px' }}>
        <h3 className="font-outfit text-gradient-primary" style={{ fontSize: '0.88rem' }}>
          Network Sentiment
        </h3>
        <span className="neon-badge">LIVE</span>
      </div>

      {/* Big score */}
      <div className="flex-between" style={{ marginBottom: '20px', alignItems: 'flex-end' }}>
        <div>
          <p className="label-caps" style={{ marginBottom: '6px' }}>Signal Score</p>
          <p className="stat-glow" style={{ color, fontSize: '3.2rem', lineHeight: 1 }}>
            {loading ? '—' : value}
          </p>
        </div>
        <div className="text-right">
          <p className="label-caps" style={{ marginBottom: '6px' }}>Mode</p>
          <p className="font-outfit" style={{ fontSize: '0.9rem', fontWeight: 800 }}>
            {loading ? '…' : getLabel(value)}
          </p>
        </div>
      </div>

      {/* Bar */}
      <div style={{
        height: '6px', background: 'rgba(255,255,255,0.06)',
        borderRadius: 0, overflow: 'hidden', marginBottom: '16px',
      }}>
        <div style={{
          height: '100%',
          width: `${value}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 14px ${color}`,
          transition: 'width 1.2s cubic-bezier(.34,1.56,.64,1)',
        }} />
      </div>

      {/* Timestamp */}
      <p className="label-caps" style={{ fontSize: '0.6rem', opacity: 0.35, textAlign: 'center' }}>
        {data?.timestamp
          ? `Synced ${new Date(data.timestamp).toLocaleTimeString()}`
          : 'Awaiting sync…'}
      </p>

      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(5,5,5,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="live-dot" />
        </div>
      )}
    </div>
  )
}

export default FearGreedIndex
