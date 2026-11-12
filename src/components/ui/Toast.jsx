import { createContext, useContext, useState, useCallback, useRef } from "react";
import Icon from "./Icon.jsx";

const ToastCtx = createContext(null);

const CONFIG = {
  success: { icon: "check",   color: "var(--green)",  bg: "color-mix(in srgb, var(--green)  10%, var(--bg3))", border: "color-mix(in srgb, var(--green)  25%, transparent)" },
  error:   { icon: "x",       color: "var(--red)",    bg: "color-mix(in srgb, var(--red)    10%, var(--bg3))", border: "color-mix(in srgb, var(--red)    25%, transparent)" },
  warning: { icon: "warning", color: "var(--amber)",  bg: "color-mix(in srgb, var(--amber)  10%, var(--bg3))", border: "color-mix(in srgb, var(--amber)  25%, transparent)" },
  info:    { icon: "check",   color: "var(--accent2)", bg: "color-mix(in srgb, var(--accent) 10%, var(--bg3))", border: "color-mix(in srgb, var(--accent) 25%, transparent)" },
};

let uid = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 280);
  }, []);

  const toast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++uid;
    setToasts(prev => [...prev, { id, message, type, out: false, in: false }]);
    // micro-delay so CSS transition fires
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, in: true } : t)), 16);
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div style={{
        position: "fixed", top: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        {toasts.map(t => {
          const c = CONFIG[t.type] || CONFIG.info;
          const visible = t.in && !t.out;
          return (
            <div
              key={t.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 14px 12px 14px",
                borderRadius: "var(--radius)",
                background: c.bg,
                border: `1px solid ${c.border}`,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                maxWidth: 360, minWidth: 220,
                pointerEvents: "auto",
                transform: visible ? "translateX(0)" : "translateX(calc(100% + 28px))",
                opacity: visible ? 1 : 0,
                transition: "transform .26s cubic-bezier(.22,.68,0,1.2), opacity .22s ease",
              }}
            >
              <span style={{ color: c.color, flexShrink: 0, marginTop: 1 }}>
                <Icon name={c.icon} size={15} color={c.color} />
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text1)", lineHeight: 1.5 }}>
                {t.message}
              </span>
              <button
                onClick={() => dismiss(t.id)}
                title="Cerrar"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text3)", padding: "1px 0 0 4px", flexShrink: 0,
                  lineHeight: 0,
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
