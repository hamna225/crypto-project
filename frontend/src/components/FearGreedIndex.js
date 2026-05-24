import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const getColor = (v) => {
    if (v < 25)
        return 'var(--error)';
    if (v < 45)
        return 'var(--warning)';
    if (v < 55)
        return 'var(--text-dim)';
    if (v < 75)
        return 'var(--success)';
    return 'var(--primary)';
};
const getLabel = (v) => {
    if (v < 25)
        return '😨 Extreme Fear';
    if (v < 45)
        return '😟 Fear';
    if (v < 55)
        return '😐 Neutral';
    if (v < 75)
        return '😊 Greed';
    return '🤑 Extreme Greed';
};
const FearGreedIndex = ({ data, loading }) => {
    const raw = data?.composite_score ?? data?.value ?? 50;
    const value = Math.round(raw);
    const color = getColor(value);
    return (_jsxs("div", { style: { position: 'relative' }, children: [_jsxs("div", { className: "flex-between", style: { marginBottom: '20px' }, children: [_jsx("h3", { className: "font-outfit text-gradient-primary", style: { fontSize: '0.88rem' }, children: "Network Sentiment" }), _jsx("span", { className: "neon-badge", children: "LIVE" })] }), _jsxs("div", { className: "flex-between", style: { marginBottom: '20px', alignItems: 'flex-end' }, children: [_jsxs("div", { children: [_jsx("p", { className: "label-caps", style: { marginBottom: '6px' }, children: "Signal Score" }), _jsx("p", { className: "stat-glow", style: { color, fontSize: '3.2rem', lineHeight: 1 }, children: loading ? '—' : value })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "label-caps", style: { marginBottom: '6px' }, children: "Mode" }), _jsx("p", { className: "font-outfit", style: { fontSize: '0.9rem', fontWeight: 800 }, children: loading ? '…' : getLabel(value) })] })] }), _jsx("div", { style: {
                    height: '6px', background: 'rgba(255,255,255,0.06)',
                    borderRadius: 0, overflow: 'hidden', marginBottom: '16px',
                }, children: _jsx("div", { style: {
                        height: '100%',
                        width: `${value}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                        boxShadow: `0 0 14px ${color}`,
                        transition: 'width 1.2s cubic-bezier(.34,1.56,.64,1)',
                    } }) }), _jsx("p", { className: "label-caps", style: { fontSize: '0.6rem', opacity: 0.35, textAlign: 'center' }, children: data?.timestamp
                    ? `Synced ${new Date(data.timestamp).toLocaleTimeString()}`
                    : 'Awaiting sync…' }), loading && (_jsx("div", { style: {
                    position: 'absolute', inset: 0,
                    background: 'rgba(5,5,5,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }, children: _jsx("div", { className: "live-dot" }) }))] }));
};
export default FearGreedIndex;
//# sourceMappingURL=FearGreedIndex.js.map