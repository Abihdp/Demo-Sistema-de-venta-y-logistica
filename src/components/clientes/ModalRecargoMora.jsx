import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";

export default function ModalRecargoMora({ tramos, setTramos, onClose }) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();
  const [ediciones, setEdiciones] = useState({}); // { [tramoId]: { dias, pct } }

  const ordenados = [...tramos].sort((a, b) => a.dias - b.dias);

  const valorDias = (t) => ediciones[t.id]?.dias ?? String(t.dias);
  const valorPct  = (t) => ediciones[t.id]?.pct  ?? String(t.pct);

  const editar = (t, campo, valor) =>
    setEdiciones(prev => ({ ...prev, [t.id]: { dias: valorDias(t), pct: valorPct(t), ...prev[t.id], [campo]: valor } }));

  const guardarFila = (t) => {
    const edicion = ediciones[t.id];
    if (!edicion) return;
    const dias = Number(edicion.dias);
    const pct  = Number(edicion.pct);
    if (!Number.isFinite(dias) || dias <= 0) { toast("Los días deben ser un número mayor a 0.", "error"); return; }
    if (!Number.isFinite(pct) || pct < 0) { toast("El porcentaje debe ser un número válido.", "error"); return; }
    setTramos(prev => prev.map(x => x.id === t.id ? { ...x, dias, pct } : x));
    setEdiciones(prev => { const { [t.id]: _, ...rest } = prev; return rest; });
  };

  const descartarFila = (t) => setEdiciones(prev => { const { [t.id]: _, ...rest } = prev; return rest; });

  const agregarTramo = () => {
    const newId = tramos.length ? Math.max(...tramos.map(t => t.id)) + 1 : 1;
    const maxDias = tramos.length ? Math.max(...tramos.map(t => t.dias)) : 0;
    setTramos(prev => [...prev, { id: newId, dias: maxDias + 30, pct: 5 }]);
  };

  const eliminarTramo = async (t) => {
    if (!await confirm(`¿Eliminar el tramo de ${t.dias} días?`, { danger: true, confirmLabel: "Eliminar" })) return;
    setTramos(prev => prev.filter(x => x.id !== t.id));
    setEdiciones(prev => { const { [t.id]: _, ...rest } = prev; return rest; });
  };

  return (
    <Modal onClose={onClose} size="modal-md">
      <div className="modal-header">
        <div className="modal-title">Recargo por mora en cuenta corriente</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          Se aplica el % del tramo más alto cuyos días ya fueron superados, contando desde la venta a cta. cte. más antigua que el cliente aún no terminó de pagar. Si no hay tramos, no se aplica recargo.
        </div>
        <button className="btn btn-sm btn-primary" onClick={agregarTramo} style={{ flexShrink: 0, marginLeft: 12 }}>
          <Icon name="plus" size={13}/> Nuevo tramo
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>A partir de (días)</th>
              <th>% recargo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text3)" }}>Sin tramos configurados — no se aplica recargo</td></tr>
            )}
            {ordenados.map(t => {
              const editado = ediciones[t.id] !== undefined;
              return (
                <tr key={t.id}>
                  <td>
                    <input
                      type="number" className="form-input mono"
                      style={{ padding: "6px 8px", fontSize: 13, width: 110 }}
                      value={valorDias(t)}
                      onChange={e => editar(t, "dias", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" className="form-input mono"
                      style={{ padding: "6px 8px", fontSize: 13, width: 90 }}
                      value={valorPct(t)}
                      onChange={e => editar(t, "pct", e.target.value)}
                    />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {editado && (
                        <>
                          <button className="btn btn-sm btn-success" title="Guardar" onClick={() => guardarFila(t)}>
                            <Icon name="check" size={13}/>
                          </button>
                          <button className="btn btn-sm btn-ghost" title="Descartar" onClick={() => descartarFila(t)}>
                            <Icon name="close" size={13}/>
                          </button>
                        </>
                      )}
                      <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => eliminarTramo(t)}>
                        <Icon name="trash" size={13} color="var(--red)"/>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
