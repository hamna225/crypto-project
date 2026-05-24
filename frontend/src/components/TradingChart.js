import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
// Uses the window.LightweightCharts global injected via CDN in index.html (v4.2.2)
const TradingChart = ({ data, symbol }) => {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    // ── Init chart (re-runs when symbol changes) ──────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el)
            return;
        const LW = window.LightweightCharts;
        if (!LW?.createChart) {
            console.warn('[TradingChart] LightweightCharts CDN not yet loaded');
            return;
        }
        // Destroy previous instance
        if (chartRef.current) {
            try {
                chartRef.current.remove();
            }
            catch { /* ignore */ }
            chartRef.current = null;
            seriesRef.current = null;
        }
        el.innerHTML = '';
        const chart = LW.createChart(el, {
            width: el.clientWidth || 900,
            height: 380,
            layout: { backgroundColor: '#050505', textColor: '#555' },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.04)' },
                horzLines: { color: 'rgba(255,255,255,0.04)' },
            },
            timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
            crosshair: { mode: 1 },
        });
        const series = chart.addCandlestickSeries({
            upColor: '#00ff88',
            downColor: '#e8002d',
            borderVisible: false,
            wickUpColor: '#00ff88',
            wickDownColor: '#e8002d',
        });
        chartRef.current = chart;
        seriesRef.current = series;
        const onResize = () => chart.applyOptions({ width: el.clientWidth });
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            try {
                chart.remove();
            }
            catch { /* ignore */ }
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [symbol]);
    // ── Feed data whenever it changes ─────────────────────────────────────────
    useEffect(() => {
        if (!seriesRef.current || !data?.length)
            return;
        try {
            const formatted = data
                .map(d => ({
                time: Math.floor(new Date(d.timestamp).getTime() / 1000),
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
            }))
                .sort((a, b) => a.time - b.time)
                .filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time); // dedupe
            if (formatted.length > 0) {
                seriesRef.current.setData(formatted);
                chartRef.current?.timeScale().fitContent();
            }
        }
        catch (err) {
            console.error('[TradingChart] data error:', err);
        }
    }, [data]);
    return (_jsxs("div", { style: { position: 'relative' }, children: [_jsxs("div", { className: "flex-between", style: { marginBottom: '16px' }, children: [_jsxs("div", { className: "flex gap-3", style: { alignItems: 'center' }, children: [_jsx("span", { className: "live-dot red" }), _jsx("span", { className: "font-outfit", style: { fontSize: '1.1rem', fontWeight: 900 }, children: symbol.replace('-', ' / ') })] }), _jsx("span", { className: "neon-badge", children: "DARK HARVEST \u00B7 LIVE" })] }), data.length === 0 ? (_jsxs("div", { style: {
                    height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px dashed var(--border-glass)', flexDirection: 'column', gap: '12px',
                }, children: [_jsx("span", { className: "label-caps", children: "Fetching market data\u2026" }), _jsx("span", { className: "text-dim", style: { fontSize: '0.8rem' }, children: "Connecting to intelligence relay" })] })) : (_jsx("div", { ref: containerRef, style: { width: '100%', height: '380px' } }))] }));
};
export default TradingChart;
//# sourceMappingURL=TradingChart.js.map