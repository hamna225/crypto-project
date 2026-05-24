import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);
    const getColor = () => {
        switch (type) {
            case 'success': return 'var(--success)';
            case 'error': return 'var(--error)';
            default: return 'var(--primary)';
        }
    };
    return (_jsxs("div", { className: "glass-card animate-fade-in", style: {
            position: 'fixed',
            bottom: '40px',
            right: '40px',
            padding: '16px 24px',
            borderLeft: `4px solid ${getColor()}`,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), var(--shadow-neon)'
        }, children: [_jsx("div", { className: "live-dot", style: { background: getColor(), boxShadow: `0 0 10px ${getColor()}` } }), _jsx("span", { className: "label-caps", style: { color: '#fff', fontSize: '0.8rem' }, children: message })] }));
};
export default Toast;
//# sourceMappingURL=Toast.js.map