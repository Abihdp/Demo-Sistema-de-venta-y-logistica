import { createContext, useContext, useState, useCallback } from "react";
import Icon from "./Icon.jsx";

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  // dialog: { message, title, confirmLabel, danger, resolve }

  const confirm = useCallback((message, opts = {}) =>
    new Promise(resolve => {
      setDialog({ message, resolve, ...opts });
    }), []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div
          className="modal-bg"
          style={{ zIndex: 9000 }}
          onClick={() => close(false)}
        >
          <div
            className="modal modal-sm"
            style={{ maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {dialog.danger
                  ? <Icon name="warning" size={16} color="var(--amber)" />
                  : <Icon name="warning"  size={16} color="var(--accent2)" />
                }
                {dialog.title || "Confirmar"}
              </div>
              <button className="close-btn" onClick={() => close(false)}>
                <Icon name="close" size={15} />
              </button>
            </div>

            <div style={{ padding: "16px 20px 20px", fontSize: 14, color: "var(--text2)", lineHeight: 1.55 }}>
              {dialog.message}
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => close(false)}>
                Cancelar
              </button>
              <button
                className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => close(true)}
                autoFocus
              >
                {dialog.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
