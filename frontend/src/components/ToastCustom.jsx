import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import './Toast.css';

const ToastCustom = ({ type = 'info', message = '', duration = 3000, show = false, onClose, buttons = [], autoClose = true }) => {
  useEffect(() => {
    if (show && autoClose && duration > 0) {
      const timer = setTimeout(() => onClose(), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, autoClose, onClose]);

  if (!show) return null;

  const icons = {
    success: <CheckCircle size={20} className="toast-icon success" />,
    error:   <AlertCircle size={20} className="toast-icon error" />,
    warning: <AlertTriangle size={20} className="toast-icon warning" />,
    info:    <Info size={20} className="toast-icon info" />,
  };

  return (
    <div className="toast-container">
      <div className={`toast toast-${type} show`}>
        <div className="toast-icon-wrap">{icons[type] || icons.info}</div>
        <div className="toast-body">
          <div className="toast-title">{type}</div>
          <div className="toast-message">{message}</div>
          {buttons.length > 0 && (
            <div className="toast-buttons">
              {buttons.map((btn, i) => (
                <button key={i} className={`toast-button ${btn.type || 'default'}`} onClick={() => onClose(btn.value)}>
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="toast-close" onClick={() => onClose('dismiss')} title="Dismiss">
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default ToastCustom;
