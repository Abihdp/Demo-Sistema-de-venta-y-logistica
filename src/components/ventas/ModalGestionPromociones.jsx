import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";

export default function ModalGestionPromociones({ promociones, agregarPromocion, actualizarPromocion, eliminarPromocion, onClose }) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();

  const [ediciones, setEdiciones] = useState({}); // { [promoId]: { nombre, pct } }

  const valorNombre = (p) => ediciones[p.id]?.nombre ?? p.nombre;
  const valorPct    = (p) => ediciones[p.id]?.pct    ?? String(p.pct);

  const editar = (p, campo, valor) =>
    setEdiciones(prev => ({ ...prev, [p.id]: { nombre: valorNombre(p), pct: valorPct(p), ...prev[p.id], [campo]: valor } }));

  const guardarFila = async (p) => {
    const edicion = ediciones[p.id];
    if (!edicion) return;
    const nombre = edicion.nombre.trim();
    const pct    = Number(edicion.pct);
    if (!nombre) { toast("El nombre de la promoción no puede estar vacío.", "error"); return; }
    if (isNaN(pct) || pct < 0 || pct > 100) { toast("El % de descuento debe ser un número entre 0 y 100.", "error"); return; }
    try {
      await actualizarPromocion(p.id, { nombre, pct });
      setEdiciones(prev => { const { [p.id]: _, ...rest } = prev; return rest; });
      toast(`Promoción "${nombre}" guardada.`, "success");
    } catch (e) {
      toast("Error al guardar la promoción: " + e.message, "error");
    }
  };

  const descartarFila = (p) => setEdiciones(prev => { const { [p.id]: _, ...rest } = prev; return rest; });

  const toggleActiva = async (p) => {
    try {
      await actualizarPromocion(p.id, { activa: !p.activa });
    } catch (e) {
      toast("Error al cambiar el estado: " + e.message, "error");
    }
  };

  const handleNuevaPromocion = async () => {
    try {
      await agregarPromocion({ nombre: "Nueva promoción", pct: 0 });
    } catch (e) {
      toast("Error al agregar la promoción: " + e.message, "error");
    }
  };

  const handleEliminar = async (p) => {
    if (!await confirm(`¿Eliminar "${p.nombre}"? Las ventas que ya se hicieron con esta promoción no cambian — solo deja de estar disponible para elegir en ventas nuevas.`, { danger: true, confirmLabel: "Eliminar" })) return;
    try {
      await eliminarPromocion(p.id);
      setEdiciones(prev => { const { [p.id]: _, ...rest } = prev; return rest; });
    } catch (e) {
      toast("Error al eliminar la promoción: " + e.message, "error");
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Gestionar promociones</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          Un descuento manual que se elige por artículo al vender (ej: "Ropa Casual −15%") — no depende de rubro ni subrubro, y no afecta el resto del carrito.
        </div>
        <button className="btn btn-sm btn-primary" onClick={handleNuevaPromocion} style={{ flexShrink: 0, marginLeft: 12 }}>
          <Icon name="plus" size={13}/> Nueva promoción
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>% descuento</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {promociones.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>Sin promociones cargadas</td></tr>
            )}
            {promociones.map(p => {
              const editado = ediciones[p.id] !== undefined;
              return (
                <tr key={p.id}>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: "6px 8px", fontSize: 13, minWidth: 160 }}
                      value={valorNombre(p)}
                      onChange={e => editar(p, "nombre", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-input mono"
                      style={{ padding: "6px 8px", fontSize: 13, width: 90 }}
                      value={valorPct(p)}
                      onChange={e => editar(p, "pct", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActiva(p)}
                      className="btn btn-sm"
                      style={{
                        background: p.activa ? "color-mix(in srgb, var(--green) 15%, transparent)" : "var(--bg4)",
                        borderColor: p.activa ? "var(--green)" : "var(--border2)",
                        color: p.activa ? "var(--green)" : "var(--text3)",
                      }}
                    >
                      {p.activa ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {editado && (
                        <>
                          <button className="btn btn-sm btn-success" title="Guardar" onClick={() => guardarFila(p)}>
                            <Icon name="check" size={13}/>
                          </button>
                          <button className="btn btn-sm btn-ghost" title="Descartar" onClick={() => descartarFila(p)}>
                            <Icon name="close" size={13}/>
                          </button>
                        </>
                      )}
                      <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => handleEliminar(p)}>
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
