import React, { useEffect, useState } from 'react';

interface AnalysisResult {
  marketBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Sideways';
  keyLevels: {
    poc: number;
    support: number[];
    resistance: number[];
  };
  vwap: {
    anchorUsed: string;
    anchorDate: string | null;
    vwapLevel: number;
    priceVsVwap: string;
  };
  orderFlow: {
    control: string;
    signalType: string;
  };
  tradeIdea: {
    action: 'LONG' | 'SHORT' | 'WAIT';
    entry: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    confidence: string;
    reasoning: string[];
  };
}

const AnalyzerPanel: React.FC = () => {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('BTC-USD');

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/analysis/technical?symbol=${symbol}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Failed to fetch algorithmic data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) return <div className="text-dim" style={{ padding: '24px' }}>Initializing Math Matrix...</div>;
  if (!data) return <div className="text-dim text-danger" style={{ padding: '24px' }}>Analysis nodes offline.</div>;

  const biasColor = data.marketBias === 'Bullish' ? 'var(--success)' : data.marketBias === 'Bearish' ? 'var(--danger)' : 'var(--text-dim)';
  const actionColor = data.tradeIdea.action === 'LONG' ? 'var(--success)' : data.tradeIdea.action === 'SHORT' ? 'var(--danger)' : 'var(--warning)';

  return (
    <div className="animate-fade-in flex-col gap-4">
      {/* ── Top Bar ── */}
      <div className="flex-between">
        <h2 className="font-outfit text-gradient-primary">Algorithmic Matrix</h2>
        <select 
          value={symbol} 
          onChange={(e) => { setSymbol(e.target.value); setLoading(true); }}
          style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
            padding: '4px 12px', fontSize: '0.8rem', color: '#fff', outline: 'none'
          }}
        >
          <option value="BTC-USD">BTC Tracker</option>
          <option value="ETH-USD">ETH Tracker</option>
          <option value="SOL-USD">SOL Tracker</option>
        </select>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* ── Structure Column ── */}
        <div className="flex-col gap-3">
          <div className="glass-card" style={{ padding: '16px' }}>
            <span className="label-caps">Structural Bias</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: biasColor, marginTop: '4px' }}>
              {data.marketBias.toUpperCase()}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="glass-card flex-1" style={{ padding: '16px' }}>
              <span className="label-caps">Anchored VWAP</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '4px' }}>
                ${data.vwap.vwapLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="label-caps text-dim" style={{ fontSize: '0.65rem' }}>
                Anchor: {data.vwap.anchorUsed} ({data.vwap.priceVsVwap})
              </div>
            </div>
            <div className="glass-card flex-1" style={{ padding: '16px' }}>
              <span className="label-caps">Order Flow</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '4px' }}>
                {data.orderFlow.control}
              </div>
              <div className="label-caps text-dim" style={{ fontSize: '0.65rem' }}>
                Signal: {data.orderFlow.signalType}
              </div>
            </div>
          </div>
        </div>

        {/* ── Trade Execution Column ── */}
        <div className="glass-card flex-col" style={{ padding: '20px' }}>
          <div className="flex-between" style={{ borderBottom: '1px dashed var(--border-glass)', paddingBottom: '12px' }}>
            <span className="label-caps">Calculated Directive</span>
            <span className="neon-badge" style={{ color: actionColor, background: 'transparent', border: `1px solid ${actionColor}` }}>
              [ {data.tradeIdea.action} ] {data.tradeIdea.confidence.toUpperCase()} CONFIDENCE
            </span>
          </div>

          <div className="flex gap-3" style={{ marginTop: '16px' }}>
            {data.tradeIdea.entry && (
              <div className="flex-col gap-1">
                <span className="text-dim" style={{ fontSize: '0.75rem' }}>ENTRY ZONE</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>${data.tradeIdea.entry.toLocaleString()}</span>
              </div>
            )}
             {data.tradeIdea.takeProfit && (
              <div className="flex-col gap-1">
                <span className="text-dim" style={{ fontSize: '0.75rem' }}>TARGET</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }}>${data.tradeIdea.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
             {data.tradeIdea.stopLoss && (
              <div className="flex-col gap-1">
                <span className="text-dim" style={{ fontSize: '0.75rem' }}>INVALIDATION</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger)' }}>${data.tradeIdea.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          <div className="flex-col gap-2" style={{ marginTop: '20px' }}>
            {data.tradeIdea.reasoning.map((r, i) => (
              <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--primary-glow)' }}>▹</span> {r}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Market Geometry (POC & Support/Resistance) ── */}
      <div className="glass-card flex-col gap-2" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex-between">
          <span className="label-caps" style={{ opacity: 0.5 }}>Volume Profile Matrix (Point of Control)</span>
          <span className="label-caps" style={{ color: 'var(--primary-dim)' }}>${data.keyLevels.poc.toLocaleString()} POC</span>
        </div>
        <div className="flex gap-4" style={{ marginTop: '4px' }}>
          <div className="flex-1">
             <span className="text-dim" style={{ fontSize: '0.7rem' }}>HEAVY RESISTANCE NODES</span>
             <div className="flex gap-2" style={{ marginTop: '4px' }}>
                {data.keyLevels.resistance.map(r => (
                  <span key={r} style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(255,50,50,0.1)', color: 'var(--danger)', borderRadius: '4px' }}>${r.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                ))}
             </div>
          </div>
          <div className="flex-1">
             <span className="text-dim" style={{ fontSize: '0.7rem' }}>HEAVY SUPPORT NODES</span>
             <div className="flex gap-2" style={{ marginTop: '4px' }}>
                {data.keyLevels.support.map(s => (
                  <span key={s} style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(50,255,100,0.1)', color: 'var(--success)', borderRadius: '4px' }}>${s.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                ))}
             </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default AnalyzerPanel;
