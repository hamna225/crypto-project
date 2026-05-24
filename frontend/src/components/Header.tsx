import React from 'react'

const Header: React.FC<{ health?: any; onOpenSettings: () => void }> = ({ health, onOpenSettings }) => {
  const isOk = health?.status === 'ok' || health?.status === 'ready'

  return (
    <header style={{
      padding: '24px 48px',
      borderBottom: '1px solid var(--border-glass)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(5,5,5,0.92)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Logo */}
      <div className="flex gap-3" style={{ alignItems: 'center' }}>
        <div style={{
          width: 38, height: 38,
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.2rem',
          boxShadow: '0 0 18px var(--primary-glow)',
        }}>
          ⚡
        </div>
        <div>
          <span className="font-outfit" style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.1em' }}>
            DARK SIDE <span style={{ color: 'var(--primary)' }}>CRYPTO</span>
          </span>
        </div>
      </div>

      {/* Status + Actions */}
      <nav className="flex gap-4" style={{ alignItems: 'center' }}>
        {/* Node health indicators */}
        <div className="flex gap-4" style={{
          padding: '8px 20px',
          border: '1px solid var(--border-glass)',
          background: 'rgba(255,255,255,0.02)',
          alignItems: 'center',
        }}>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div className={`live-dot ${isOk ? '' : 'red'}`} />
            <span className="label-caps" style={{ fontSize: '0.58rem' }}>API</span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div className="live-dot" />
            <span className="label-caps" style={{ fontSize: '0.58rem' }}>SYNC</span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div className="live-dot" style={{ background: 'var(--warning)', boxShadow: '0 0 8px var(--warning)' }} />
            <span className="label-caps" style={{ fontSize: '0.58rem' }}>ARKHAM</span>
          </div>
        </div>

        <button className="btn-antigravity btn-ghost" onClick={onOpenSettings} style={{ padding: '10px 18px' }}>
          ⚙ Config
        </button>
        <button className="btn-antigravity btn-primary" style={{ padding: '10px 22px' }}>
          ⚡ Terminal α
        </button>
      </nav>
    </header>
  )
}

export default Header
