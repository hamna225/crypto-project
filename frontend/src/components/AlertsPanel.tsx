import React, { useState, useEffect } from 'react'
import axios from 'axios'

interface Alert {
  id: string
  type: string
  title: string
  message: string
  time: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  from_address?: string
  to_address?: string
}

const severityColor = (s: string) =>
  s === 'critical' ? 'var(--error)' : s === 'high' ? 'var(--warning)' : 'var(--text-dim)'

const severityIcon = (s: string) =>
  s === 'critical' ? '🚨' : s === 'high' ? '⚠️' : '📊'

const AlertsPanel: React.FC<{ limit?: number }> = ({ limit }) => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await axios.get('/api/alerts?limit=50')
        if (res.data?.success && Array.isArray(res.data.data)) {
          const mapped = res.data.data.map((a: any) => {
            const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {})
            return {
              id: a.id,
              type: String(a.type).toUpperCase(),
              severity: a.severity,
              title: a.title,
              message: a.body,
              time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              from_address: meta.fromAddress,
              to_address: meta.toAddress,
            }
          })
          setAlerts(mapped)
        }
      } catch (err) {
        console.error('Failed to fetch live alerts', err)
      }
    }

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 15000)
    return () => clearInterval(interval)
  }, [])

  const displayAlerts = limit ? alerts.slice(0, limit) : alerts

  const openArkham = (address?: string) => {
    if (!address) return
    window.open(`https://platform.arkhamintelligence.com/explorer/address/${address}`, '_blank', 'noopener')
  }

  return (
    <div className="animate-fade-in">
      {!limit && (
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 className="font-outfit text-gradient-primary" style={{ fontSize: '1rem' }}>
              Alert Matrix
            </h2>
            <p className="text-dim" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              Real-time heuristics · anomaly detection · whale signals
            </p>
          </div>
          <div className="flex gap-2">
            <span className="neon-badge">
              {alerts.filter(a => a.severity === 'critical').length} CRITICAL
            </span>
            <span className="badge-glow">
              {alerts.filter(a => a.severity === 'high').length} HIGH
            </span>
          </div>
        </div>
      )}

      {displayAlerts.length === 0 ? (
        <div className="glass-card flex-center" style={{ minHeight: '150px', borderStyle: 'dashed' }}>
          <p className="label-caps text-dim">No recent anomalies detected</p>
        </div>
      ) : (
        <div className="flex-col gap-3">
          {displayAlerts.map(alert => (
            <div key={alert.id}
              className="glass-card"
              style={{
                padding: '16px 20px',
                borderLeft: `3px solid ${severityColor(alert.severity)}`,
              }}>
              <div className="flex-between" style={{ width: '100%', gap: '12px' }}>

                {/* Left: icon + text */}
                <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>{severityIcon(alert.severity)}</span>
                  <div className="flex-col gap-1">
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{alert.title}</span>
                    <span className="text-dim" style={{ fontSize: '0.82rem' }}>{alert.message}</span>

                    {/* Arkham buttons for whale transactions */}
                    {alert.type.includes('WHALE') && (alert.from_address || alert.to_address) && (
                      <div className="flex gap-2" style={{ marginTop: '8px' }}>
                        {alert.from_address && (
                          <button
                            className="neon-badge"
                            style={{ cursor: 'pointer', border: 'none', background: 'var(--primary-dim)' }}
                            onClick={() => openArkham(alert.from_address)}>
                            🔍 ARKHAM SOURCE
                          </button>
                        )}
                        {alert.to_address && (
                          <button
                            className="neon-badge"
                            style={{ cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.04)', color: 'var(--text-dim)' }}
                            onClick={() => openArkham(alert.to_address)}>
                            🔍 ARKHAM TARGET
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: type + time */}
                <div className="text-right flex-col gap-1" style={{ flexShrink: 0 }}>
                  <span className="label-caps">{alert.type.replace('_', ' ')}</span>
                  <span className="text-ghost" style={{ fontSize: '0.72rem' }}>{alert.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!limit && (
        <div style={{ marginTop: '36px', padding: '24px', border: '1px dashed var(--border-glass)' }}>
          <h3 className="font-outfit" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>Signal Categories</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {['Price Thresholds', 'Whale Activity', 'Fear & Greed', 'Technical Patterns', 'Social Sentiment'].map(s => (
              <span key={s} className="badge-glow" style={{ padding: '6px 12px' }}>✓ {s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AlertsPanel
