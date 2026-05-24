import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import axios from 'axios';
const severityColor = (s) => s === 'critical' ? 'var(--error)' : s === 'high' ? 'var(--warning)' : 'var(--text-dim)';
const severityIcon = (s) => s === 'critical' ? '🚨' : s === 'high' ? '⚠️' : '📊';
const AlertsPanel = ({ limit }) => {
    const [alerts, setAlerts] = useState([]);
    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await axios.get('/api/alerts?limit=50');
                if (res.data?.success && Array.isArray(res.data.data)) {
                    const mapped = res.data.data.map((a) => {
                        const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {});
                        return {
                            id: a.id,
                            type: String(a.type).toUpperCase(),
                            severity: a.severity,
                            title: a.title,
                            message: a.body,
                            time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            from_address: meta.fromAddress,
                            to_address: meta.toAddress,
                        };
                    });
                    setAlerts(mapped);
                }
            }
            catch (err) {
                console.error('Failed to fetch live alerts', err);
            }
        };
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 15000);
        return () => clearInterval(interval);
    }, []);
    const displayAlerts = limit ? alerts.slice(0, limit) : alerts;
    const openArkham = (address) => {
        if (!address)
            return;
        window.open(`https://platform.arkhamintelligence.com/explorer/address/${address}`, '_blank', 'noopener');
    };
    return (_jsxs("div", { className: "animate-fade-in", children: [!limit && (_jsxs("div", { className: "flex-between", style: { marginBottom: '28px' }, children: [_jsxs("div", { children: [_jsx("h2", { className: "font-outfit text-gradient-primary", style: { fontSize: '1rem' }, children: "Alert Matrix" }), _jsx("p", { className: "text-dim", style: { fontSize: '0.8rem', marginTop: '4px' }, children: "Real-time heuristics \u00B7 anomaly detection \u00B7 whale signals" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("span", { className: "neon-badge", children: [alerts.filter(a => a.severity === 'critical').length, " CRITICAL"] }), _jsxs("span", { className: "badge-glow", children: [alerts.filter(a => a.severity === 'high').length, " HIGH"] })] })] })), displayAlerts.length === 0 ? (_jsx("div", { className: "glass-card flex-center", style: { minHeight: '150px', borderStyle: 'dashed' }, children: _jsx("p", { className: "label-caps text-dim", children: "No recent anomalies detected" }) })) : (_jsx("div", { className: "flex-col gap-3", children: displayAlerts.map(alert => (_jsx("div", { className: "glass-card", style: {
                        padding: '16px 20px',
                        borderLeft: `3px solid ${severityColor(alert.severity)}`,
                    }, children: _jsxs("div", { className: "flex-between", style: { width: '100%', gap: '12px' }, children: [_jsxs("div", { className: "flex gap-3", style: { alignItems: 'flex-start' }, children: [_jsx("span", { style: { fontSize: '1.1rem', marginTop: '2px' }, children: severityIcon(alert.severity) }), _jsxs("div", { className: "flex-col gap-1", children: [_jsx("span", { style: { fontWeight: 700, fontSize: '0.9rem' }, children: alert.title }), _jsx("span", { className: "text-dim", style: { fontSize: '0.82rem' }, children: alert.message }), alert.type.includes('WHALE') && (alert.from_address || alert.to_address) && (_jsxs("div", { className: "flex gap-2", style: { marginTop: '8px' }, children: [alert.from_address && (_jsx("button", { className: "neon-badge", style: { cursor: 'pointer', border: 'none', background: 'var(--primary-dim)' }, onClick: () => openArkham(alert.from_address), children: "\uD83D\uDD0D ARKHAM SOURCE" })), alert.to_address && (_jsx("button", { className: "neon-badge", style: { cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.04)', color: 'var(--text-dim)' }, onClick: () => openArkham(alert.to_address), children: "\uD83D\uDD0D ARKHAM TARGET" }))] }))] })] }), _jsxs("div", { className: "text-right flex-col gap-1", style: { flexShrink: 0 }, children: [_jsx("span", { className: "label-caps", children: alert.type.replace('_', ' ') }), _jsx("span", { className: "text-ghost", style: { fontSize: '0.72rem' }, children: alert.time })] })] }) }, alert.id))) })), !limit && (_jsxs("div", { style: { marginTop: '36px', padding: '24px', border: '1px dashed var(--border-glass)' }, children: [_jsx("h3", { className: "font-outfit", style: { marginBottom: '14px', fontSize: '0.85rem' }, children: "Signal Categories" }), _jsx("div", { className: "flex gap-2", style: { flexWrap: 'wrap' }, children: ['Price Thresholds', 'Whale Activity', 'Fear & Greed', 'Technical Patterns', 'Social Sentiment'].map(s => (_jsxs("span", { className: "badge-glow", style: { padding: '6px 12px' }, children: ["\u2713 ", s] }, s))) })] }))] }));
};
export default AlertsPanel;
//# sourceMappingURL=AlertsPanel.js.map