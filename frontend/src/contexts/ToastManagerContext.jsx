import React, { createContext, useContext, useState } from 'react';
import ToastCustom from '../components/ToastCustom';

const ToastManagerContext = createContext();

export const useToastManager = () => {
  const context = useContext(ToastManagerContext);
  return context;
};

export const ToastManagerProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = ({ type, message, duration = 3000, buttons = [] }) => {
    const id = Date.now() + Math.random();
    const newToast = { id, type, message, duration, buttons };

    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, duration);
    }
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const ToastContainer = () => {
    if (toasts.length === 0) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: '90vw',
      }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto', width: '100%' }}>
            <ToastCustom
              type={toast.type}
              message={toast.message}
              duration={toast.duration}
              buttons={toast.buttons}
              show={true}
              onClose={(buttonValue) => {
                if (buttonValue && toast.buttons?.length > 0) {
                  toast.buttons.find(btn => btn.value === buttonValue)?.onClick?.();
                }
                removeToast(toast.id);
              }}
              autoClose={toast.duration > 0}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <ToastManagerContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastManagerContext.Provider>
  );
};

export default ToastManagerProvider;
