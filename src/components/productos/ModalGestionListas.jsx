import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import { FORMAS_PAGO } from "../../constants/index.js";
import { runInBatches } from "../../utils/helpers.js";

export default function ModalGestionListas({ listas, productos, actualizarProducto, configPrecios = {}, actualizarConfigPrecios, agregarLista: agregarListaDB, actualizarLista: actualizarListaDB, eliminarLista: eliminarListaDB, usuarioActivo, onClose }) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();
  const margenBase = configPrecios?.margenBase ?? 0;
  const esRolAdmin = usuarioActivo?.rol === "admin";
  const [margenInput, setMargenInput] = useState(String(margenBase));
  const [guardandoStockNeg, setGuardandoStockNeg] = useState(false);

  const toggleStockNegativo = async () => {
    setGuardandoStockNeg(true);
    try {
      await actualizarConfigPrecios({ permitirStockNegativo: !configPrecios?.permitirStockNegativo });
      toast(`Stock en negativo ${!configPrecios?.permitirStockNegativo ? "activado" : "desactivado"}.`, "success");
    } catch (e) {
      toast("Error al guardar la configuración: " + e.message, "error");
    }
    setGuardandoStockNeg(false);
  };
  const [guardandoEditarPrecio, setGuardandoEditarPrecio] = useState(false);

  const toggleEditarPrecioVenta = async () => {
    setGuardandoEditarPrecio(true);
    try {
      await actualizarConfigPrecios({ permitirEditarPrecioVenta: !configPrecios?.permitirEditarPrecioVenta });
      toast(`Edición de precio en la venta ${!configPrecios?.permitirEditarPrecioVenta ? "activada" : "desactivada"}.`, "success");
    } catch (e) {
      toast("Error al guardar la configuración: " + e.message, "error");
    }
    setGuardandoEditarPrecio(false);
  };
  const [diasAvisoInput, setDiasAvisoInput] = useState(String(configPrecios?.diasAvisoActualizarPrecios ?? 15));
  const [guardandoDiasAviso, setGuardandoDiasAviso] = useState(false);

  const guardarDiasAviso = async () => {
    const dias = parseInt(diasAvisoInput, 10);
    if (isNaN(dias) || dias < 0) { toast("Ingresá un número de días válido.", "error"); return; }
    setGuardandoDiasAviso(true);
    try {
      await actualizarConfigPrecios({ diasAvisoActualizarPrecios: dias });
      toast("Umbral de aviso de precios actualizado.", "success");
    } catch (e) {
      toast("Error al guardar la configuración: " + e.message, "error");
    }
    setGuardandoDiasAviso(false);
  };

  const [guardandoLogo, setGuardandoLogo] = useState(false);

  // Se achica del lado del navegador antes de guardar (el logo va también al
  // ticket térmico impreso, no hace falta más resolución que el ancho del
  // papel — subir la foto original completa solo pesaría de más en la base).
  const handleSubirLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Elegí un archivo de imagen.", "error"); return; }

    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const anchoMax = 300;
        const escala = Math.min(1, anchoMax / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");

        setGuardandoLogo(true);
        try {
          await actualizarConfigPrecios({ logoBase64: dataUrl });
          toast("Logo actualizado.", "success");
        } catch (err) {
          toast("Error al guardar el logo: " + err.message, "error");
        }
        setGuardandoLogo(false);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  };

  const handleQuitarLogo = async () => {
    setGuardandoLogo(true);
    try {
      await actualizarConfigPrecios({ logoBase64: null });
      toast("Logo quitado.", "success");
    } catch (e) {
      toast("Error al quitar el logo: " + e.message, "error");
    }
    setGuardandoLogo(false);
  };

  const [ediciones, setEdiciones] = useState({}); // { [listaId]: { nombre, pct } }

  const valorNombre = (l) => ediciones[l.id]?.nombre ?? l.nombre;
  const valorPct    = (l) => ediciones[l.id]?.pct    ?? String(l.pct);

  const editar = (l, campo, valor) =>
    setEdiciones(prev => ({ ...prev, [l.id]: { nombre: valorNombre(l), pct: valorPct(l), ...prev[l.id], [campo]: valor } }));

  const guardarFila = async (l) => {
    const edicion = ediciones[l.id];
    if (!edicion) return;
    const nombre = edicion.nombre.trim();
    const pct    = Number(edicion.pct);
    if (!nombre) { toast("El nombre de la lista no puede estar vacío.", "error"); return; }
    if (isNaN(pct)) { toast("El porcentaje debe ser un número válido.", "error"); return; }
    try {
      await actualizarListaDB(l.id, { nombre, pct });
      setEdiciones(prev => { const { [l.id]: _, ...rest } = prev; return rest; });
      toast(`Lista "${nombre}" guardada.`, "success");
    } catch (e) {
      toast("Error al guardar lista: " + e.message, "error");
    }
  };

  const descartarFila = (l) => setEdiciones(prev => { const { [l.id]: _, ...rest } = prev; return rest; });

  // Una lista puede aceptar varios medios de pago (ej: Efectivo, Transferencia
  // y Débito en la lista base; Crédito en la lista con recargo). Si no tiene
  // ninguno marcado, se entiende que acepta cualquier medio de pago.
  const toggleFormaPago = async (lista, forma) => {
    const actuales = lista.formasPago || [];
    const seAgrega = !actuales.includes(forma);
    if (seAgrega) {
      const otraLista = listas.find(l => l.id !== lista.id && (l.formasPago || []).includes(forma));
      if (otraLista) {
        toast(`"${forma}" ya está asignado a "${otraLista.nombre}". Primero quitalo de esa lista.`, "error");
        return;
      }
    }
    const formasPago = seAgrega ? [...actuales, forma] : actuales.filter(f => f !== forma);
    try {
      await actualizarListaDB(lista.id, { formasPago });
    } catch (e) {
      toast("Error al guardar medio de pago: " + e.message, "error");
    }
  };

  const handleNuevaLista = async () => {
    try {
      await agregarListaDB({ nombre: "Nueva lista", pct: 0 });
    } catch (e) {
      toast("Error al agregar lista: " + e.message, "error");
    }
  };

  const handleEliminarLista = async (l) => {
    if (listas.filter(x => x.activa !== false).length <= 1) { toast("Debe existir al menos una lista de precio activa.", "warning"); return; }
    if (!await confirm(`¿Eliminar "${l.nombre}"? Los precios manuales fijados para esta lista en productos se perderán y dejará de estar disponible para elegir en ventas.`, { danger: true, confirmLabel: "Eliminar" })) return;
    try {
      await eliminarListaDB(l.id);
      const afectados = productos.filter(p => p.precios && p.precios[l.id] !== undefined);
      await runInBatches(afectados, 20, p => {
        const { [l.id]: _, ...resto } = p.precios;
        return actualizarProducto(p.id, { precios: resto });
      });
      setEdiciones(prev => { const { [l.id]: _, ...rest } = prev; return rest; });
      toast(`Lista "${l.nombre}" eliminada.`, "success");
    } catch (e) {
      toast("Error al eliminar lista: " + e.message, "error");
    }
  };

  const handleReactivarLista = async (l) => {
    try {
      await actualizarListaDB(l.id, { activa: true });
      toast(`Lista "${l.nombre}" reactivada.`, "success");
    } catch (e) {
      toast("Error al reactivar lista: " + e.message, "error");
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Gestionar listas de precio</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      {/* Margen base global */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "var(--bg2)", borderRadius: "var(--radius)", border: "1px solid var(--border2)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 2 }}>Margen base (% de ganancia)</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>
            Define el precio base de cada producto: <strong>costo × (1 + margen%)</strong>. Las listas suman o descuentan desde ese precio base.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <input
            type="number"
            className="form-input mono"
            style={{ width: 80, padding: "6px 8px", fontSize: 14, fontWeight: 600 }}
            value={margenInput}
            onChange={e => setMargenInput(e.target.value)}
          />
          <span style={{ fontSize: 13, color: "var(--text2)" }}>%</span>
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => {
              const val = Number(margenInput);
              if (isNaN(val) || val < 0) { toast("El margen debe ser un número mayor o igual a 0.", "error"); return; }
              try {
                await actualizarConfigPrecios({ margenBase: val });
                toast(`Margen base actualizado a ${val}%.`, "success");
              } catch (e) {
                toast("Error al guardar el margen base: " + e.message, "error");
              }
            }}
          >
            Guardar
          </button>
        </div>
      </div>

      {/* Stock en negativo — solo admin */}
      {esRolAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "var(--bg2)", borderRadius: "var(--radius)", border: "1px solid var(--border2)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 2 }}>Permitir stock en negativo</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              Con esto activado, ventas, movimientos y pases se registran igual aunque no haya stock suficiente (avisando), hasta que corrijas el inventario. Aplica a todo el sistema.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={guardandoStockNeg}
            onClick={toggleStockNegativo}
            style={{
              flexShrink: 0,
              background: configPrecios?.permitirStockNegativo ? "rgba(245,158,11,0.15)" : undefined,
              borderColor: configPrecios?.permitirStockNegativo ? "var(--amber)" : undefined,
              color: configPrecios?.permitirStockNegativo ? "var(--amber)" : undefined,
            }}
          >
            {configPrecios?.permitirStockNegativo ? "Activado — click para desactivar" : "Desactivado — click para activar"}
          </button>
        </div>
      )}

      {/* Editar precio a mano en la venta — solo admin */}
      {esRolAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "var(--bg2)", borderRadius: "var(--radius)", border: "1px solid var(--border2)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 2 }}>Permitir editar el precio en la venta</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              Con esto activado, se puede corregir a mano el precio de cada artículo dentro del carrito de Ventas — pensado como algo temporal mientras se terminan de cargar bien los precios del sistema. Aplica a todo el sistema; no hace falta ningún permiso adicional por usuario.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={guardandoEditarPrecio}
            onClick={toggleEditarPrecioVenta}
            style={{
              flexShrink: 0,
              background: configPrecios?.permitirEditarPrecioVenta ? "rgba(245,158,11,0.15)" : undefined,
              borderColor: configPrecios?.permitirEditarPrecioVenta ? "var(--amber)" : undefined,
              color: configPrecios?.permitirEditarPrecioVenta ? "var(--amber)" : undefined,
            }}
          >
            {configPrecios?.permitirEditarPrecioVenta ? "Activado — click para desactivar" : "Desactivado — click para activar"}
          </button>
        </div>
      )}

      {/* Aviso de actualizar precios en ventas con seña pendiente — solo admin */}
      {esRolAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "var(--bg2)", borderRadius: "var(--radius)", border: "1px solid var(--border2)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 2 }}>Avisar actualizar precios después de (días)</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              En una venta con seña pendiente de retiro, si pasaron más de estos días desde que se cobró la seña, se muestra un aviso con opción de recalcular los precios contra la lista vigente.
            </div>
          </div>
          <input
            className="form-input mono" type="number" min="0" style={{ width: 70, flexShrink: 0 }}
            value={diasAvisoInput} onChange={e => setDiasAvisoInput(e.target.value)}
          />
          <button type="button" className="btn btn-sm" disabled={guardandoDiasAviso} onClick={guardarDiasAviso} style={{ flexShrink: 0 }}>
            Guardar
          </button>
        </div>
      )}

      {/* Logo del ticket */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "var(--bg2)", borderRadius: "var(--radius)", border: "1px solid var(--border2)" }}>
        {configPrecios?.logoBase64 ? (
          <img src={configPrecios.logoBase64} alt="Logo" style={{ maxWidth: 70, maxHeight: 70, borderRadius: 6, background: "#fff", padding: 4, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 70, height: 70, borderRadius: 6, background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "var(--text3)", textAlign: "center" }}>
            Sin logo
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 2 }}>Logo del ticket</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>
            Aparece arriba del nombre en el ticket de venta, tanto en pantalla como en la impresora térmica. Usá una imagen simple (blanco y negro o alto contraste) — se convierte a blanco y negro puro para imprimirse.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <label className="btn btn-sm" style={{ cursor: "pointer" }}>
            <Icon name="upload" size={13}/> {configPrecios?.logoBase64 ? "Cambiar" : "Subir"}
            <input type="file" accept="image/*" onChange={handleSubirLogo} disabled={guardandoLogo} style={{ display: "none" }} />
          </label>
          {configPrecios?.logoBase64 && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={guardandoLogo} onClick={handleQuitarLogo}>
              <Icon name="trash" size={13} color="var(--red)"/>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          El % de cada lista es el ajuste (positivo o negativo) sobre el precio base. Ejemplo: -10% aplica un descuento; +15% aplica un recargo.
          Marcá los medios de pago que acepta cada lista: al elegirla en una venta, "Forma de pago" se limita a esos medios. Sin ninguno marcado, acepta cualquier medio.
        </div>
        <button className="btn btn-sm btn-primary" onClick={handleNuevaLista} style={{ flexShrink: 0, marginLeft: 12 }}>
          <Icon name="plus" size={13}/> Nueva lista
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>% ajuste (+/-)</th>
              <th>Medio de pago</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listas.map(l => {
              const editado = ediciones[l.id] !== undefined;
              const inactiva = l.activa === false;
              return (
                <tr key={l.id} style={{ opacity: inactiva ? 0.5 : 1 }}>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: "6px 8px", fontSize: 13, minWidth: 160 }}
                      value={valorNombre(l)}
                      disabled={inactiva}
                      onChange={e => editar(l, "nombre", e.target.value)}
                    />
                    {inactiva && (
                      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 3 }}>Eliminada — no disponible para elegir en ventas</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-input mono"
                      style={{ padding: "6px 8px", fontSize: 13, width: 90 }}
                      value={valorPct(l)}
                      disabled={inactiva}
                      onChange={e => editar(l, "pct", e.target.value)}
                    />
                  </td>
                  <td style={{ minWidth: 260 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {FORMAS_PAGO.map(f => {
                        const activo = (l.formasPago || []).includes(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            disabled={inactiva}
                            onClick={() => toggleFormaPago(l, f)}
                            style={{
                              padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: inactiva ? "not-allowed" : "pointer",
                              border: `1px solid ${activo ? "var(--accent2)" : "var(--border2)"}`,
                              background: activo ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                              color: activo ? "var(--accent2)" : "var(--text3)",
                            }}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                    {!(l.formasPago || []).length && (
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>Acepta cualquier medio de pago</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {editado && !inactiva && (
                        <>
                          <button className="btn btn-sm btn-success" title="Guardar" onClick={() => guardarFila(l)}>
                            <Icon name="check" size={13}/>
                          </button>
                          <button className="btn btn-sm btn-ghost" title="Descartar" onClick={() => descartarFila(l)}>
                            <Icon name="close" size={13}/>
                          </button>
                        </>
                      )}
                      {inactiva ? (
                        <button className="btn btn-sm btn-ghost" title="Reactivar" style={{ color: "var(--green)" }} onClick={() => handleReactivarLista(l)}>
                          <Icon name="unlock" size={13}/>
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => handleEliminarLista(l)}>
                          <Icon name="trash" size={13} color="var(--red)"/>
                        </button>
                      )}
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
