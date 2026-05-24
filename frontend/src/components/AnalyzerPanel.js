import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const AnalyzerPanel = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [symbol, setSymbol] = useState('BTC-USD');
    const fetchData = async () => {
        try {
            const res = await fetch(`/api/analysis/technical?symbol=${symbol}`);
            const json = await res.json();
            if (json.success)
                setData(json.data);
        }
        catch (err) {
            console.error('Failed to fetch algorithmic data', err);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // 15s refresh
        return () => clearInterval(interval);
    }, [symbol]);
    if (loading)
        return _jsx("div", { className: "text-dim", style: { padding: '24px' }, children: "Initializing Math Matrix..." });
    if (!data)
        return _jsx("div", { className: "text-dim text-danger", style: { padding: '24px' }, children: "Analysis nodes offline." });
    const biasColor = data.marketBias === 'Bullish' ? 'var(--success)' : data.marketBias === 'Bearish' ? 'var(--danger)' : 'var(--text-dim)';
    const actionColor = data.tradeIdea.action === 'LONG' ? 'var(--success)' : data.tradeIdea.action === 'SHORT' ? 'var(--danger)' : 'var(--warning)';
    return (_jsxs("div", { className: "animate-fade-in flex-col gap-4", children: [_jsxs("div", { className: "flex-between", children: [_jsx("h2", { className: "font-outfit text-gradient-primary", children: "Algorithmic Matrix" }), _jsxs("select", { value: symbol, onChange: (e) => { setSymbol(e.target.value); setLoading(true); }, style: {
                            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                            padding: '4px 12px', fontSize: '0.8rem', color: '#fff', outline: 'none'
                        }, children: [_jsx("option", { value: "BTC-USD", children: "BTC Tracker" }), _jsx("option", { value: "ETH-USD", children: "ETH Tracker" }), _jsx("option", { value: "SOL-USD", children: "SOL Tracker" })] })] }), _jsxs("div", { className: "grid", style: { gridTemplateColumns: '1fr 1fr', gap: '24px' }, children: [_jsxs("div", { className: "flex-col gap-3", children: [_jsxs("div", { className: "glass-card", style: { padding: '16px' }, children: [_jsx("span", { className: "label-caps", children: "Structural Bias" }), _jsx("div", { style: { fontSize: '1.4rem', fontWeight: 900, color: biasColor, marginTop: '4px' }, children: data.marketBias.toUpperCase() })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "glass-card flex-1", style: { padding: '16px' }, children: [_jsx("span", { className: "label-caps", children: "Anchored VWAP" }), _jsxs("div", { style: { fontSize: '1.2rem', fontWeight: 700, marginTop: '4px' }, children: ["$", data.vwap.vwapLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })] }), _jsxs("div", { className: "label-caps text-dim", style: { fontSize: '0.65rem' }, children: ["Anchor: ", data.vwap.anchorUsed, " (", data.vwap.priceVsVwap, ")"] })] }), _jsxs("div", { className: "glass-card flex-1", style: { padding: '16px' }, children: [_jsx("span", { className: "label-caps", children: "Order Flow" }), _jsx("div", { style: { fontSize: '1.2rem', fontWeight: 700, marginTop: '4px' }, children: data.orderFlow.control }), _jsxs("div", { className: "label-caps text-dim", style: { fontSize: '0.65rem' }, children: ["Signal: ", data.orderFlow.signalType] })] })] })] }), _jsxs("div", { className: "glass-card flex-col", style: { padding: '20px' }, children: [_jsxs("div", { className: "flex-between", style: { borderBottom: '1px dashed var(--border-glass)', paddingBottom: '12px' }, children: [_jsx("span", { className: "label-caps", children: "Calculated Directive" }), _jsxs("span", { className: "neon-badge", style: { color: actionColor, background: 'transparent', border: `1px solid ${actionColor}` }, children: ["[ ", data.tradeIdea.action, " ] ", data.tradeIdea.confidence.toUpperCase(), " CONFIDENCE"] })] }), _jsxs("div", { className: "flex gap-3", style: { marginTop: '16px' }, children: [data.tradeIdea.entry && (_jsxs("div", { className: "flex-col gap-1", children: [_jsx("span", { className: "text-dim", style: { fontSize: '0.75rem' }, children: "ENTRY ZONE" }), _jsxs("span", { style: { fontSize: '1.1rem', fontWeight: 600 }, children: ["$", data.tradeIdea.entry.toLocaleString()] })] })), data.tradeIdea.takeProfit && (_jsxs("div", { className: "flex-col gap-1", children: [_jsx("span", { className: "text-dim", style: { fontSize: '0.75rem' }, children: "TARGET" }), _jsxs("span", { style: { fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }, children: ["$", data.tradeIdea.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })] })] })), data.tradeIdea.stopLoss && (_jsxs("div", { className: "flex-col gap-1", children: [_jsx("span", { className: "text-dim", style: { fontSize: '0.75rem' }, children: "INVALIDATION" }), _jsxs("span", { style: { fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger)' }, children: ["$", data.tradeIdea.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })] })] }))] }), _jsx("div", { className: "flex-col gap-2", style: { marginTop: '20px' }, children: data.tradeIdea.reasoning.map((r, i) => (_jsxs("div", { style: { fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', gap: '8px' }, children: [_jsx("span", { style: { color: 'var(--primary-glow)' }, children: "\u25B9" }), " ", r] }, i))) })] })] }), _jsxs("div", { className: "glass-card flex-col gap-2", style: { padding: '16px', background: 'rgba(255,255,255,0.01)' }, children: [_jsxs("div", { className: "flex-between", children: [_jsx("span", { className: "label-caps", style: { opacity: 0.5 }, children: "Volume Profile Matrix (Point of Control)" }), _jsxs("span", { className: "label-caps", style: { color: 'var(--primary-dim)' }, children: ["$", data.keyLevels.poc.toLocaleString(), " POC"] })] }), _jsxs("div", { className: "flex gap-4", style: { marginTop: '4px' }, children: [_jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-dim", style: { fontSize: '0.7rem' }, children: "HEAVY RESISTANCE NODES" }), _jsx("div", { className: "flex gap-2", style: { marginTop: '4px' }, children: data.keyLevels.resistance.map(r => (_jsxs("span", { style: { fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(255,50,50,0.1)', color: 'var(--danger)', borderRadius: '4px' }, children: ["$", r.toLocaleString(undefined, { maximumFractionDigits: 0 })] }, r))) })] }), _jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-dim", style: { fontSize: '0.7rem' }, children: "HEAVY SUPPORT NODES" }), _jsx("div", { className: "flex gap-2", style: { marginTop: '4px' }, children: data.keyLevels.support.map(s => (_jsxs("span", { style: { fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(50,255,100,0.1)', color: 'var(--success)', borderRadius: '4px' }, children: ["$", s.toLocaleString(undefined, { maximumFractionDigits: 0 })] }, s))) })] })] })] })] }));
};
export default AnalyzerPanel;
//# sourceMappingURL=AnalyzerPanel.js.map