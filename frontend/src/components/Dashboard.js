import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './Header';
import FearGreedIndex from './FearGreedIndex';
import PredictionsPanel from './PredictionsPanel';
import AlertsPanel from './AlertsPanel';
import AnalyzerPanel from './AnalyzerPanel';
import ConfigModal from './ConfigModal';
import Toast from './Toast';
import TradingChart from './TradingChart';
const COINS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD', 'XRP-USD'];
const Dashboard = () => {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [configStatus, setConfigStatus] = useState([]);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedSymbol, setSelectedSymbol] = useState('BTC-USD');
    const [candles, setCandles] = useState([]);
    const [candleLoading, setCandleLoading] = useState(false);
    const showToast = (msg, type) => setToast({ msg, type });
    const fetchCandles = async (symbol) => {
        setCandleLoading(true);
        try {
            const res = await axios.get(`/api/tickers/${symbol}/candles?interval=1h&limit=100`);
            setCandles(res.data.data || []);
        }
        catch {
            setCandles([]);
        }
        finally {
            setCandleLoading(false);
        }
    };
    const fetchData = async () => {
        try {
            const [fgRes, healthRes, configRes] = await Promise.allSettled([
                axios.get('/api/fear-greed/latest'),
                axios.get('/api/health'),
                axios.get('/api/config/status'),
            ]);
            if (fgRes.status === 'fulfilled')
                setData(d => ({ ...d, fearGreed: fgRes.value.data.data }));
            if (healthRes.status === 'fulfilled')
                setData(d => ({ ...d, health: healthRes.value.data.data }));
            if (configRes.status === 'fulfilled') {
                const st = configRes.value.data?.data?.status;
                if (Array.isArray(st))
                    setConfigStatus(st);
            }
        }
        catch { /* network error — silently retry */ }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchData();
        fetchCandles(selectedSymbol);
        const t1 = setInterval(fetchData, 30000);
        const t2 = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => { clearInterval(t1); clearInterval(t2); };
    }, [selectedSymbol]); // re-run when coin changes
    const alchemySet = configStatus.some(k => k.id === 'ALCHEMY_PROJECT_ID' && k.isSet);
    return (_jsxs("div", { children: [_jsx(Header, { health: data.health, onOpenSettings: () => setIsConfigOpen(true) }), _jsx("main", { className: "main-layout", children: _jsxs("div", { className: "dashboard-grid", children: [_jsxs("div", { className: "col-12 glass-card animate-fade-in flex-between", style: { padding: '28px 44px', borderLeft: '3px solid var(--primary)' }, children: [_jsxs("div", { className: "flex-col gap-1", children: [_jsxs("h1", { className: "font-outfit text-gradient-primary", style: { fontSize: '2.2rem', fontWeight: 900 }, children: ["DARK SIDE ", _jsx("span", { style: { color: 'var(--primary)' }, children: "CRYPTO" })] }), _jsxs("p", { className: "label-caps", style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [_jsx("span", { style: { color: 'var(--primary)' }, children: currentTime.toLocaleTimeString() }), _jsx("span", { style: { opacity: 0.15 }, children: "\u2502" }), _jsx("span", { children: "Imperial Intelligence Network \u00B7 Zero-Lag Feed" })] })] }), _jsxs("div", { className: "flex gap-5", children: [_jsxs("div", { className: "text-right", children: [_jsx("p", { className: "label-caps", style: { marginBottom: '6px' }, children: "Psych-Index" }), _jsxs("p", { className: "stat-glow", style: { fontSize: '1.8rem', color: 'var(--primary)' }, children: [loading ? '—' : (data.fearGreed?.composite_score ?? '—'), _jsx("span", { style: { fontSize: '0.9rem', color: 'var(--text-ghost)', marginLeft: 4 }, children: "/100" })] })] }), _jsxs("div", { className: "text-right", style: { borderLeft: '1px solid var(--border-glass)', paddingLeft: '28px' }, children: [_jsx("p", { className: "label-caps", style: { marginBottom: '6px' }, children: "Node Status" }), _jsxs("div", { className: "flex gap-2", style: { alignItems: 'center', justifyContent: 'flex-end' }, children: [_jsx("div", { className: "live-dot" }), _jsx("span", { style: { fontWeight: 900, letterSpacing: '0.1em' }, children: "DOMINANT" })] })] }), _jsxs("div", { className: "text-right", style: { borderLeft: '1px solid var(--border-glass)', paddingLeft: '28px' }, children: [_jsx("p", { className: "label-caps", style: { marginBottom: '6px' }, children: "Whale Net" }), _jsxs("div", { className: "flex gap-2", style: { alignItems: 'center', justifyContent: 'flex-end' }, children: [_jsx("div", { className: `live-dot ${alchemySet ? '' : 'red'}` }), _jsx("span", { style: { fontWeight: 900, letterSpacing: '0.1em', color: alchemySet ? 'var(--success)' : 'var(--primary)' }, children: alchemySet ? 'SYNCED' : 'SETUP↗' })] })] })] })] }), _jsx("div", { className: "col-8 animate-fade-in", style: { animationDelay: '0.1s' }, children: _jsxs("div", { className: "glass-card", style: { padding: '32px' }, children: [_jsxs("div", { className: "flex gap-2", style: { marginBottom: '24px', flexWrap: 'wrap' }, children: [COINS.map(s => (_jsx("button", { className: `btn-antigravity ${selectedSymbol === s ? 'btn-primary' : 'btn-ghost'}`, style: { padding: '7px 14px', fontSize: '0.63rem' }, onClick: () => setSelectedSymbol(s), children: s.split('-')[0] }, s))), candleLoading && _jsx("span", { className: "label-caps", style: { color: 'var(--primary)', alignSelf: 'center' }, children: "LOADING\u2026" })] }), _jsx(TradingChart, { data: candles, symbol: selectedSymbol })] }) }), _jsxs("div", { className: "col-4 flex-col gap-4", style: { animationDelay: '0.15s' }, children: [_jsx("div", { className: "glass-card animate-fade-in", children: _jsx(FearGreedIndex, { data: data.fearGreed, loading: loading }) }), _jsxs("div", { className: "glass-card animate-fade-in", style: { animationDelay: '0.2s' }, children: [_jsx("h3", { className: "font-outfit text-gradient-primary", style: { marginBottom: '20px', fontSize: '0.9rem' }, children: "Operations" }), _jsxs("div", { className: "ticker-row", children: [_jsx("span", { className: "label-caps", children: "Dark Harvest" }), _jsx("span", { className: "neon-badge", children: "ACTIVE" })] }), _jsxs("div", { className: "ticker-row", children: [_jsx("span", { className: "label-caps", children: "Arkham Intelligence" }), _jsx("a", { href: "https://platform.arkhamintelligence.com", target: "_blank", rel: "noreferrer", style: { textDecoration: 'none' }, children: _jsx("span", { className: "badge-glow", style: { cursor: 'pointer' }, children: "OPEN \u2197" }) })] }), _jsxs("div", { className: "ticker-row", children: [_jsx("span", { className: "label-caps", children: "ML Inference" }), _jsx("span", { className: "badge-glow", children: "READY" })] }), _jsxs("div", { className: "ticker-row", children: [_jsx("span", { className: "label-caps", children: "Whale Tracker" }), _jsx("span", { className: alchemySet ? 'trend-up' : '', style: { fontSize: '0.65rem', fontWeight: 900 }, children: alchemySet ? 'SYNCED' : 'NEEDS KEY' })] }), _jsxs("div", { className: "ticker-row", children: [_jsx("span", { className: "label-caps", children: "Orderflow" }), _jsx("span", { style: { fontSize: '0.65rem', fontWeight: 900, color: 'var(--success)' }, children: "OPTIMAL" })] }), !alchemySet && (_jsx("button", { className: "btn-antigravity btn-primary", style: { width: '100%', marginTop: '20px' }, onClick: () => setIsConfigOpen(true), children: "\u26A1 Configure Keys" }))] })] }), _jsx("div", { className: "col-12 animate-fade-in", style: { animationDelay: '0.2s' }, children: _jsxs("div", { className: "glass-card", style: { minHeight: '550px', padding: '32px' }, children: [_jsx("div", { className: "flex gap-3", style: { marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }, children: ['overview', 'predictions', 'analyzer', 'alerts'].map(tab => (_jsx("button", { className: `btn-antigravity ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`, onClick: () => setActiveTab(tab), children: tab === 'overview' ? '📡 Signal Terminal' : tab === 'predictions' ? '🤖 ML Intelligence' : tab === 'analyzer' ? '⚖️ Technical Analyzer' : '🚨 Alert Matrix' }, tab))) }), _jsxs("div", { className: "tab-pane", children: [activeTab === 'overview' && (_jsxs("div", { className: "animate-fade-in", children: [_jsx("p", { className: "text-dim", style: { marginBottom: '24px', fontSize: '0.85rem' }, children: "Streaming real-time orderflow, whale movements, and sentiment signals\u2026" }), _jsx(AlertsPanel, { limit: 6 })] })), activeTab === 'predictions' && _jsx(PredictionsPanel, {}), activeTab === 'analyzer' && _jsx(AnalyzerPanel, {}), activeTab === 'alerts' && _jsx(AlertsPanel, {})] })] }) })] }) }), _jsx("footer", { style: { textAlign: 'center', padding: '48px', borderTop: '1px solid var(--border-glass)' }, children: _jsx("p", { className: "label-caps", style: { opacity: 0.3 }, children: "\u00A9 2026 Dark Side Crypto \u00B7 Imperial Intelligence Network" }) }), _jsx(ConfigModal, { isOpen: isConfigOpen, onClose: () => setIsConfigOpen(false), configs: configStatus, onConfigsUpdated: fetchData, onShowToast: showToast }), toast && (_jsx(Toast, { message: toast.msg, type: toast.type, onClose: () => setToast(null) }))] }));
};
export default Dashboard;
//# sourceMappingURL=Dashboard.js.map