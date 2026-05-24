import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import axios from 'axios';
// Static ML predictions — replaced by live API data when available
const MOCK_PREDICTIONS = [
    { symbol: 'BTC-USD', horizon: '1H', confidence: 0.74, direction: 'UP', price_low: 64200, price_high: 65800, trend_strength: 'STRONG' },
    { symbol: 'BTC-USD', horizon: '4H', confidence: 0.68, direction: 'UP', price_low: 63500, price_high: 67200, trend_strength: 'MODERATE' },
    { symbol: 'ETH-USD', horizon: '1H', confidence: 0.61, direction: 'DOWN', price_low: 3440, price_high: 3580, trend_strength: 'WEAK' },
    { symbol: 'SOL-USD', horizon: '1H', confidence: 0.77, direction: 'UP', price_low: 165, price_high: 178, trend_strength: 'STRONG' },
];
const PredictionsPanel = () => {
    const [predictions, setPredictions] = React.useState(MOCK_PREDICTIONS);
    React.useEffect(() => {
        axios.get('/api/predictions/latest')
            .then(r => { if (r.data?.data?.length)
            setPredictions(r.data.data); })
            .catch(() => { });
    }, []);
    const dirColor = (d) => d === 'UP' ? 'var(--success)' : 'var(--error)';
    return (_jsxs("div", { className: "animate-fade-in", children: [_jsxs("div", { className: "flex-between", style: { marginBottom: '28px' }, children: [_jsxs("div", { children: [_jsx("h2", { className: "font-outfit text-gradient-primary", style: { fontSize: '1rem' }, children: "ML Intelligence" }), _jsxs("p", { className: "text-dim", style: { fontSize: '0.8rem', marginTop: '4px' }, children: ["XGBoost Ensemble \u00B7 ", predictions.length, " active predictions"] })] }), _jsx("span", { className: "neon-badge", children: "MODEL v1.0" })] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }, children: predictions.map((p, i) => (_jsxs("div", { className: "glass-card", style: { padding: '24px', borderTop: `2px solid ${dirColor(p.direction)}` }, children: [_jsxs("div", { className: "flex-between", style: { marginBottom: '20px' }, children: [_jsxs("div", { className: "flex gap-2", style: { alignItems: 'center' }, children: [_jsx("span", { className: "font-outfit", style: { fontSize: '1.1rem', fontWeight: 900 }, children: p.symbol.replace('-USD', '') }), _jsx("span", { className: "badge-glow", children: p.horizon })] }), _jsx("span", { style: {
                                        fontWeight: 900, fontSize: '0.85rem',
                                        color: dirColor(p.direction),
                                        textShadow: `0 0 12px ${dirColor(p.direction)}55`,
                                    }, children: p.direction === 'UP' ? '↗ LONG' : '↘ SHORT' })] }), _jsxs("div", { className: "flex-between", style: { marginBottom: '6px' }, children: [_jsx("span", { className: "label-caps", children: "Confidence" }), _jsxs("span", { style: { fontWeight: 800, fontSize: '0.85rem' }, children: [Math.round(p.confidence * 100), "%"] })] }), _jsx("div", { style: { height: '5px', background: 'rgba(255,255,255,0.05)', marginBottom: '20px' }, children: _jsx("div", { style: {
                                    height: '100%', width: `${p.confidence * 100}%`,
                                    background: dirColor(p.direction),
                                    boxShadow: `0 0 10px ${dirColor(p.direction)}`,
                                    transition: 'width 1s ease',
                                } }) }), _jsxs("div", { className: "flex-between", style: {
                                padding: '12px', background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border-glass)',
                            }, children: [_jsxs("div", { className: "flex-col gap-1", children: [_jsx("span", { className: "label-caps", style: { fontSize: '0.58rem' }, children: "Target Low" }), _jsxs("span", { style: { fontWeight: 700, fontSize: '0.95rem' }, children: ["$", p.price_low.toLocaleString()] })] }), _jsxs("div", { className: "text-right flex-col gap-1", children: [_jsx("span", { className: "label-caps", style: { fontSize: '0.58rem' }, children: "Target High" }), _jsxs("span", { style: { fontWeight: 700, fontSize: '0.95rem' }, children: ["$", p.price_high.toLocaleString()] })] })] }), p.trend_strength && (_jsx("div", { style: { marginTop: '12px', textAlign: 'right' }, children: _jsxs("span", { className: "label-caps", style: { fontSize: '0.6rem' }, children: ["Trend: ", _jsx("span", { style: { color: dirColor(p.direction) }, children: p.trend_strength })] }) }))] }, i))) }), _jsx("div", { style: { marginTop: '32px', padding: '20px', border: '1px solid var(--border-glass)', background: 'var(--primary-dim)' }, children: _jsx("p", { className: "text-dim", style: { fontSize: '0.82rem' }, children: "\u2139\uFE0F \u00A0Predictions are derived from real-time RSI, MACD, Bollinger Bands, and on-chain volume flow synchronized with local SQLite." }) })] }));
};
export default PredictionsPanel;
//# sourceMappingURL=PredictionsPanel.js.map