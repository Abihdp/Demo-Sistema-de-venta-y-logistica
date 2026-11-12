import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import { fmt, fmtFechaAR, fmtHoraAR } from "../../utils/helpers.js";
import { useOutboxStatus, runSync, reintentarOp, descartarOp } from "../../lib/outbox.js";
import { useConnectivity } from "../../lib/connectivity.js";

// Un tipo por cada operación que un hook puede encolar (ver registerHandler
// en useVentas/useRecibos/useCaja) — si se agrega un tipo nuevo ahí, agregar
// también acá su ícono/etiqueta y su forma de armar la descripción.
const TIPO_INFO = {
  confirmarVenta:  { label: "Venta",           icon: "receipt" },
  emitirRecibo:    { label: "Recibo / N.C. / N.D.", icon: "cash" },
  agregarRetiro:   { label: "Retiro de caja",   icon: "minus" },
  agregarRefuerzo: { label: "Refuerzo de caja", icon: "plus" },
};

function describir(op) {
  const p = op.payload || {};
  switch (op.type) {
    case "confirmarVenta": {
      const v = p.venta || {};
      return { titulo: v.cliente || "Consumidor Final", detalle: `${fmt(v.total || 0)} · ${v.formaPago || "—"}` };
    }
    case "emitirRecibo": {
      const d = p.data || {};
      return { titulo: d.cliente || "—", detalle: `${d.tipo || "Recibo"} · ${fmt(d.monto || 0)} · ${d.formaPago || "—"}` };
    }
    case "agregarRetiro": {
      const f = p.fila || {};
      return { titulo: f.motivo || "Retiro", detalle: `${fmt(f.monto || 0)} · ${f.medio || "Efectivo"}` };
    }
    case "agregarRefuerzo": {
      const f = p.fila || {};
      return { titulo: f.motivo || "Refuerzo", detalle: fmt(f.monto || 0) };
    }
    default:
      return { titulo: op.type, detalle: "" };
  }
}

const ESTADO_INFO = {
  pending: { label: "Pendiente",              badge: "badge-warn"   },
  syncing: { label: "Sincronizando…",          badge: "badge-blue"   },
  failed:  { label: "No se pudo sincronizar",  badge: "badge-danger" },
};

export default function PageSincronizacion() {
  const isOnline = useConnectivity();
  const { ops, pendientes, fallidas } = useOutboxStatus();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [descartando, setDescartando] = useState(null);

  const ordenados = [...ops].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const reintentarTodo = () => {
    if (!isOnline) { toast("Sin conexión — esperá a que vuelva internet.", "warning"); return; }
    ops.forEach(op => reintentarOp(op.opId));
    runSync();
    toast("Reintentando sincronización...", "info");
  };

  const reintentarUna = (op) => {
    if (!isOnline) { toast("Sin conexión — esperá a que vuelva internet.", "warning"); return; }
    reintentarOp(op.opId);
  };

  const descartar = async (op) => {
    const { titulo, detalle } = describir(op);
    const tipoLabel = (TIPO_INFO[op.type] || {}).label || op.type;
    const ok = await confirm(
      `Vas a descartar "${tipoLabel} — ${titulo}" (${detalle}). Esto NO se va a guardar en el sistema — se pierde para siempre, no se puede deshacer. Si ya aparecía en alguna pantalla (Ventas, Caja, etc.) va a seguir viéndose ahí hasta que recargues la página — recargá después de descartar para que desaparezca. ¿Confirmás?`,
      { title: "Descartar operación pendiente", confirmLabel: "Sí, descartar", danger: true }
    );
    if (!ok) return;
    setDescartando(op.opId);
    try {
      await descartarOp(op.opId);
      toast("Operación descartada. Recargá la página para que desaparezca de donde se mostraba.", "info");
    } finally {
      setDescartando(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <div className="metric-card">
          <div className="metric-label">Conexión</div>
          <div className="metric-value" style={{ color: isOnline ? "var(--green)" : "var(--red)" }}>
            {isOnline ? "En línea" : "Sin conexión"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pendientes de sincronizar</div>
          <div className="metric-value" style={{ color: pendientes > 0 ? "var(--amber)" : "var(--text1)" }}>{pendientes}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">No se pudieron sincronizar</div>
          <div className="metric-value" style={{ color: fallidas.length > 0 ? "var(--red)" : "var(--text1)" }}>{fallidas.length}</div>
        </div>
      </div>

      {!isOnline && (
        <div style={{ padding: "10px 14px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>
          Sin conexión a internet. Lo que se registre ahora (ventas, recibos, retiros, refuerzos) queda guardado en esta computadora y se sincroniza solo apenas vuelva la señal — no hace falta cargarlo de nuevo.
        </div>
      )}

      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Operaciones sin confirmar ({ops.length})</div>
          {ops.length > 0 && (
            <button className="btn btn-sm" disabled={!isOnline} onClick={reintentarTodo}>
              <Icon name="sync" size={13} /> Reintentar todo
            </button>
          )}
        </div>

        {ordenados.length === 0 ? (
          <div style={{ padding: "36px 0", textAlign: "center" }}>
            <Icon name="check" size={22} color="var(--green)" />
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--text3)" }}>Todo sincronizado. No hay operaciones pendientes.</div>
          </div>
        ) : (
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {ordenados.map(op => {
              const { titulo, detalle } = describir(op);
              const tipoInfo = TIPO_INFO[op.type] || { label: op.type, icon: "info" };
              const estadoInfo = ESTADO_INFO[op.status] || ESTADO_INFO.pending;
              return (
                <div key={op.opId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <Icon name={tipoInfo.icon} size={15} color="var(--text3)" />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>{tipoInfo.label} — {titulo}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)" }}>{detalle}</div>
                    {op.status === "failed" && op.error && (
                      <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>{op.error}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", minWidth: 90, textAlign: "right" }}>
                    {fmtFechaAR(op.createdAt.slice(0, 10))} {fmtHoraAR(op.createdAt)}
                  </div>
                  <span className={`badge ${estadoInfo.badge}`} style={{ minWidth: 130, textAlign: "center" }}>
                    {estadoInfo.label}
                  </span>
                  {op.status === "failed" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-ghost" disabled={!isOnline} onClick={() => reintentarUna(op)} title="Reintentar">
                        <Icon name="sync" size={13} />
                      </button>
                      <button className="btn btn-sm btn-ghost" disabled={descartando === op.opId} onClick={() => descartar(op)} title="Descartar (se pierde para siempre)">
                        <Icon name="trash" size={13} color="var(--red)" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
