import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Header = ({ health, onOpenSettings }) => {
    const isOk = health?.status === 'ok' || health?.status === 'ready';
    return (_jsxs("header", { style: {
            padding: '24px 48px',
            borderBottom: '1px solid var(--border-glass)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, zIndex: 100,
            background: 'rgba(5,5,5,0.92)',
            backdropFilter: 'blur(20px)',
        }, children: [_jsxs("div", { className: "flex gap-3", style: { alignItems: 'center' }, children: [_jsx("div", { style: {
                            width: 38, height: 38,
                            background: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem',
                            boxShadow: '0 0 18px var(--primary-glow)',
                        }, children: "\u26A1" }), _jsx("div", { children: _jsxs("span", { className: "font-outfit", style: { fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.1em' }, children: ["DARK SIDE ", _jsx("span", { style: { color: 'var(--primary)' }, children: "CRYPTO" })] }) })] }), _jsxs("nav", { className: "flex gap-4", style: { alignItems: 'center' }, children: [_jsxs("div", { className: "flex gap-4", style: {
                            padding: '8px 20px',
                            border: '1px solid var(--border-glass)',
                            background: 'rgba(255,255,255,0.02)',
                            alignItems: 'center',
                        }, children: [_jsxs("div", { className: "flex gap-2", style: { alignItems: 'center' }, children: [_jsx("div", { className: `live-dot ${isOk ? '' : 'red'}` }), _jsx("span", { className: "label-caps", style: { fontSize: '0.58rem' }, children: "API" })] }), _jsxs("div", { className: "flex gap-2", style: { alignItems: 'center' }, children: [_jsx("div", { className: "live-dot" }), _jsx("span", { className: "label-caps", style: { fontSize: '0.58rem' }, children: "SYNC" })] }), _jsxs("div", { className: "flex gap-2", style: { alignItems: 'center' }, children: [_jsx("div", { className: "live-dot", style: { background: 'var(--warning)', boxShadow: '0 0 8px var(--warning)' } }), _jsx("span", { className: "label-caps", style: { fontSize: '0.58rem' }, children: "ARKHAM" })] })] }), _jsx("button", { className: "btn-antigravity btn-ghost", onClick: onOpenSettings, style: { padding: '10px 18px' }, children: "\u2699 Config" }), _jsx("button", { className: "btn-antigravity btn-primary", style: { padding: '10px 22px' }, children: "\u26A1 Terminal \u03B1" })] })] }));
};
export default Header;
//# sourceMappingURL=Header.js.map