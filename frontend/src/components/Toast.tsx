import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
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

  return (
    <div className="glass-card animate-fade-in" style={{
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
    }}>
      <div className="live-dot" style={{ background: getColor(), boxShadow: `0 0 10px ${getColor()}` }} />
      <span className="label-caps" style={{ color: '#fff', fontSize: '0.8rem' }}>{message}</span>
    </div>
  );
};

export default Toast;
