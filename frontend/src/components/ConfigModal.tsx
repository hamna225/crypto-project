import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ConfigItem {
  id: string;
  name: string;
  required: boolean;
  isSet: boolean;
  source: string;
}

interface ConfigModalProps {
  onConfigsUpdated: () => void;
  configs: ConfigItem[];
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type: 'success' | 'error') => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ configs, isOpen, onClose, onConfigsUpdated, onShowToast }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // lock background scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/api/config', { keys: values });
      onShowToast('CONFIGURATION SYNCHRONIZED', 'success');
      onConfigsUpdated();
      onClose();
    } catch (err) {
      onShowToast('SYNCHRONIZATION FAILED', 'error');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div
        className="glass-card animate-fade-in"
        role="dialog"
        aria-modal="true"
        style={{ 
          width: '100%', maxWidth: '680px', padding: '28px', position: 'relative',
          display: 'flex', flexDirection: 'column', maxHeight: '100%', minHeight: 0
        }}
      >
        <button
          className="modal-close"
          aria-label="Close configuration"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="modal-header" style={{ flexShrink: 0, marginBottom: '24px' }}>
          <h2 className="font-outfit text-gradient-primary" style={{ marginBottom: '8px' }}>SYSTEM INITIALIZATION</h2>
          <p className="text-dim" style={{ fontSize: '0.9rem' }}>
            Connect your Antigravity node to external data providers to enable full intelligence tracking.
          </p>
        </div>

        <div className="modal-content" style={{ overflowY: 'auto', paddingRight: '8px', flex: 1, minHeight: 0 }}>
          <div className="flex-col gap-4" style={{ marginBottom: '40px' }}>
            {configs.map(cfg => (
              <div key={cfg.id} className="config-field">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <label className="label-caps" style={{ color: cfg.isSet ? 'var(--success)' : 'var(--text-main)' }}>
                    {cfg.name} {cfg.required && '*'}
                  </label>
                  {cfg.isSet && <span className="neon-badge" style={{ fontSize: '0.6rem' }}>CONNECTED</span>}
                </div>
                <input
                  type="password"
                  className="glass-input"
                  placeholder={cfg.isSet ? '••••••••••••••••' : `Enter ${cfg.name}`}
                  value={values[cfg.id] || ''}
                  onChange={(e) => setValues({ ...values, [cfg.id]: e.target.value })}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px', color: '#fff', fontSize: '0.9rem',
                    outline: 'none', transition: 'border-color 0.2s'
                  }}
                />
              </div>
            ))}
          </div>

        </div>

        <div className="flex gap-3" style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px dashed var(--border-glass)', flexShrink: 0 }}>
          <button className="btn-antigravity btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'SYNCING...' : 'SAVE CONFIGURATION'}
          </button>
          <button className="btn-antigravity btn-ghost" onClick={onClose} aria-label="Cancel configuration">
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
