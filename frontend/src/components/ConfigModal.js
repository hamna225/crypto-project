import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import axios from 'axios';
const ConfigModal = ({ configs, isOpen, onClose, onConfigsUpdated, onShowToast }) => {
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);
    const [targetWallet, setTargetWallet] = useState('');
    const [addingWallet, setAddingWallet] = useState(false);
    if (!isOpen)
        return null;
    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.post('/api/config', { keys: values });
            onShowToast('CONFIGURATION SYNCHRONIZED', 'success');
            onConfigsUpdated();
            onClose();
        }
        catch (err) {
            onShowToast('SYNCHRONIZATION FAILED', 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const handleAddTarget = async () => {
        if (!targetWallet)
            return;
        setAddingWallet(true);
        try {
            await axios.post('/api/whales/wallets', { address: targetWallet, alias: 'Custom Target UI' });
            onShowToast('TARGET ACQUIRED AND TRACKED', 'success');
            setTargetWallet('');
        }
        catch (err) {
            onShowToast('TARGET ACQUISITION FAILED', 'error');
        }
        finally {
            setAddingWallet(false);
        }
    };
    return (_jsx("div", { className: "modal-overlay", style: {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }, children: _jsxs("div", { className: "glass-card animate-fade-in", style: { width: '100%', maxWidth: '500px', padding: '40px' }, children: [_jsx("h2", { className: "font-outfit text-gradient-primary", style: { marginBottom: '8px' }, children: "SYSTEM INITIALIZATION" }), _jsx("p", { className: "text-dim", style: { marginBottom: '32px', fontSize: '0.9rem' }, children: "Connect your Antigravity node to external data providers to enable full intelligence tracking." }), _jsx("div", { className: "flex-col gap-4", style: { marginBottom: '40px' }, children: configs.map(cfg => (_jsxs("div", { className: "config-field", children: [_jsxs("div", { className: "flex-between", style: { marginBottom: '8px' }, children: [_jsxs("label", { className: "label-caps", style: { color: cfg.isSet ? 'var(--success)' : 'var(--text-main)' }, children: [cfg.name, " ", cfg.required && '*'] }), cfg.isSet && _jsx("span", { className: "neon-badge", style: { fontSize: '0.6rem' }, children: "CONNECTED" })] }), _jsx("input", { type: "password", className: "glass-input", placeholder: cfg.isSet ? '••••••••••••••••' : `Enter ${cfg.name}`, value: values[cfg.id] || '', onChange: (e) => setValues({ ...values, [cfg.id]: e.target.value }), style: {
                                    width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                                    borderRadius: 'var(--radius-md)', padding: '12px 16px', color: '#fff', fontSize: '0.9rem',
                                    outline: 'none', transition: 'border-color 0.2s'
                                } })] }, cfg.id))) }), _jsxs("div", { className: "flex-col gap-2", style: { marginBottom: '32px', paddingTop: '24px', borderTop: '1px dashed var(--border-glass)' }, children: [_jsx("label", { className: "label-caps", children: "Dynamically Monitor 0x Wallet" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", className: "glass-input flex-1", placeholder: "Paste ETH Address 0x...", value: targetWallet, onChange: (e) => setTargetWallet(e.target.value), style: {
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                                        borderRadius: 'var(--radius-md)', padding: '12px 16px', color: '#fff', fontSize: '0.9rem',
                                        outline: 'none'
                                    } }), _jsx("button", { className: "btn-antigravity btn-ghost", disabled: addingWallet || !targetWallet, onClick: handleAddTarget, style: { border: '1px solid var(--border-glass)' }, children: addingWallet ? 'SYNCING...' : 'TARGET' })] })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { className: "btn-antigravity btn-primary", onClick: handleSave, disabled: saving, style: { flex: 1 }, children: saving ? 'SYNCING...' : 'SAVE CONFIGURATION' }), _jsx("button", { className: "btn-antigravity btn-ghost", onClick: onClose, children: "CLOSE" })] })] }) }));
};
export default ConfigModal;
//# sourceMappingURL=ConfigModal.js.map