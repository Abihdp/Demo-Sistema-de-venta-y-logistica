import { useState, useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { today, fmtFechaAR } from "../../utils/helpers.js";
import ModalDeposito from "./ModalDeposito.jsx";
import ModalNuevoPase from "./ModalNuevoPase.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";

const TIPO_LABEL   = { normal:"Normal", reserva:"Reservas", transito:"Tránsito" };
const ESTADO_BADGE  = {
  en_transito: { label:"En tránsito", cls:"badge-warn"   },
  recibido:    { label:"Recibido",    cls:"badge-ok"     },
  anulado:     { label:"Anulado",     cls:"badge-danger" },
};

export default function PageDepositos({
  depositos,       setDepositos,
  stockDepositos,  setStockDepositos,
  pasesDeposito,   setPasesDeposito,
  productos,
  usuarioActivo,
  permisos,
  configPrecios = {},
  agregarDeposito,
  actualizarStockDepositoMultiple,
  agregarPase,
  actualizarPase,
}) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();
  const esAdmin = !!permisos?.[usuarioActivo?.id]?.gestionarDepositos;
  const permitirStockNegativo = configPrecios?.permitirStockNegativo ?? false;

  const [tab, setTab] = useState("pases");
  const [modalDeposito, setModalDeposito] = useState(null); // null | {} (nuevo) | deposito (editar)
  const [modalPase,     setModalPase]     = useState(false);

  // ── Filtros: pases de depósito ───────────────────────────────────────────
  const [fPase, setFPase] = useState({ estado:"", origenId:"", destinoId:"", desde:"", hasta:"" });
  const setFP = (k, v) => setFPase(f => ({ ...f, [k]: v }));
  const limpiarFiltrosPase = () => setFPase({ estado:"", origenId:"", destinoId:"", desde:"", hasta:"" });
  const hayFiltrosPase = Object.values(fPase).some(Boolean);

  // ── Filtros: depósitos ───────────────────────────────────────────────────
  const [buscarDep, setBuscarDep] = useState("");
  const [fTipoDep,  setFTipoDep]  = useState("");

  const depositoTransito = depositos.find(d => d.tipo === "transito");

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stockTotalDeposito = (depositoId) =>
    stockDepositos.filter(s => s.depositoId === depositoId).reduce((a, s) => a + s.cantidad, 0);

  const pasesOrdenados = useMemo(() =>
    pasesDeposito
      .filter(p => Array.isArray(p.items))
      .slice()
      .sort((a, b) => b.id - a.id),
    [pasesDeposito]
  );

  const pasesFiltrados = useMemo(() => pasesOrdenados.filter(p => {
    if (fPase.estado    && p.estado             !== fPase.estado)             return false;
    if (fPase.origenId  && p.depositoOrigenId   !== Number(fPase.origenId))   return false;
    if (fPase.destinoId && p.depositoDestinoId  !== Number(fPase.destinoId))  return false;
    if (fPase.desde     && p.fecha < fPase.desde)                             return false;
    if (fPase.hasta      && p.fecha > fPase.hasta)                            return false;
    return true;
  }), [pasesOrdenados, fPase]);

  const { pagina: paginaPases, setPagina: setPaginaPases, totalPaginas: totalPaginasPases, itemsPagina: pasesPagina, pageSize: pageSizePases } = usePaginacion(pasesFiltrados);

  const depositosFiltrados = useMemo(() => depositos.filter(d => {
    if (buscarDep && !d.nombre.toLowerCase().includes(buscarDep.toLowerCase())) return false;
    if (fTipoDep  && d.tipo !== fTipoDep)                                       return false;
    return true;
  }), [depositos, buscarDep, fTipoDep]);

  // ── Handlers: depósitos ──────────────────────────────────────────────────
  const handleGuardarDeposito = async (data) => {
    if (data.id) {
      setDepositos(prev => prev.map(d =>
        d.id === data.id ? { ...d, nombre: data.nombre, ...(d.tipo !== "transito" ? { tipo: data.tipo } : {}) } : d
      ));
    } else {
      try {
        await agregarDeposito({ nombre: data.nombre, tipo: data.tipo });
      } catch (err) {
        toast(err.message, "error");
        return;
      }
    }
    setModalDeposito(null);
  };

  const handleEliminarDeposito = async (d) => {
    if (d.tipo === "transito") { toast("El depósito de tránsito es de sistema y no puede eliminarse.", "warning"); return; }
    if (stockTotalDeposito(d.id) > 0) { toast("No se puede eliminar: el depósito tiene stock. Trasladá o ajustá el stock a 0 antes de eliminarlo.", "error"); return; }
    if (!await confirm(`¿Eliminar el depósito "${d.nombre}"?`, { danger: true, confirmLabel: "Eliminar" })) return;
    setDepositos(prev => prev.filter(x => x.id !== d.id));
    setStockDepositos(prev => prev.filter(s => s.depositoId !== d.id));
  };

  // ── Handlers: pases de depósito ───────────────────────────────────────────
  const handleCrearPase = async (data) => {
    const origen  = depositos.find(d => d.id === data.depositoOrigenId);
    const destino = depositos.find(d => d.id === data.depositoDestinoId);

    // Stock: sale del origen → entra al depósito de tránsito
    const cambios = data.items.flatMap(item => {
      const sdOrigen  = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === data.depositoOrigenId);
      const sdTransito = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === depositoTransito?.id);
      const nuevaOrigen = (sdOrigen?.cantidad || 0) - item.cantidad;
      return [
        { productoId: item.productoId, depositoId: data.depositoOrigenId,   cantidad: permitirStockNegativo ? nuevaOrigen : Math.max(0, nuevaOrigen) },
        { productoId: item.productoId, depositoId: depositoTransito?.id,    cantidad: (sdTransito?.cantidad || 0) + item.cantidad },
      ];
    });

    try {
      await actualizarStockDepositoMultiple(cambios);
    } catch (err) {
      toast(`Error al actualizar stock: ${err.message}`, "error");
      return;
    }

    try {
      await agregarPase({
        fecha:                 today(),
        depositoOrigenId:      data.depositoOrigenId,
        depositoOrigenNombre:  origen?.nombre  || "",
        depositoDestinoId:     data.depositoDestinoId,
        depositoDestinoNombre: destino?.nombre || "",
        items: data.items.map(i => ({
          ...i,
          productoNombre: productos.find(p => p.id === i.productoId)?.nombre || "",
        })),
        estado:      "en_transito",
        observacion: data.observacion,
        usuarioEnvio: usuarioActivo?.nombre || "",
      });
    } catch (err) {
      toast(`Stock actualizado, pero hubo un error al registrar el pase: ${err.message}`, "warning");
    }
    setModalPase(false);
  };

  const handleRecepcionar = async (pase) => {
    if (!await confirm(`¿Confirmar la recepción del pase hacia "${pase.depositoDestinoNombre}"?`, { title: "Confirmar recepción", confirmLabel: "Recepcionar" })) return;

    // Stock: sale del tránsito → entra al destino
    const cambios = pase.items.flatMap(item => {
      const sdTransito = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === depositoTransito?.id);
      const sdDestino  = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === pase.depositoDestinoId);
      return [
        { productoId: item.productoId, depositoId: depositoTransito?.id,   cantidad: Math.max(0, (sdTransito?.cantidad || 0) - item.cantidad) },
        { productoId: item.productoId, depositoId: pase.depositoDestinoId, cantidad: (sdDestino?.cantidad  || 0) + item.cantidad },
      ];
    });

    try {
      await actualizarStockDepositoMultiple(cambios);
    } catch (err) {
      toast(`Error al actualizar stock: ${err.message}`, "error");
      return;
    }

    try {
      await actualizarPase(pase.id, { estado: "recibido", fechaRecepcion: today(), usuarioRecepcion: usuarioActivo?.nombre || "" });
    } catch (err) {
      toast(`Stock actualizado, pero hubo un error al registrar la recepción: ${err.message}`, "warning");
    }
  };

  const handleAnular = async (pase) => {
    if (!await confirm(`¿Anular el pase hacia "${pase.depositoDestinoNombre}"? La mercadería vuelve al depósito de origen.`, { danger: true, confirmLabel: "Anular pase" })) return;

    // Stock: sale del tránsito → vuelve al origen
    const cambios = pase.items.flatMap(item => {
      const sdTransito = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === depositoTransito?.id);
      const sdOrigen   = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === pase.depositoOrigenId);
      return [
        { productoId: item.productoId, depositoId: depositoTransito?.id,  cantidad: Math.max(0, (sdTransito?.cantidad || 0) - item.cantidad) },
        { productoId: item.productoId, depositoId: pase.depositoOrigenId, cantidad: (sdOrigen?.cantidad   || 0) + item.cantidad },
      ];
    });

    try {
      await actualizarStockDepositoMultiple(cambios);
    } catch (err) {
      toast(`Error al actualizar stock: ${err.message}`, "error");
      return;
    }

    try {
      await actualizarPase(pase.id, { estado: "anulado", fechaAnulacion: today() });
    } catch (err) {
      toast(`Stock actualizado, pero hubo un error al registrar la anulación: ${err.message}`, "warning");
    }
  };

  const TAB_STYLE = (id) => ({
    borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
    borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
    color:        tab === id ? "var(--accent2)" : "var(--text2)",
    gap:6, paddingBottom:10,
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Tabs */}
      <div style={{display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid var(--border)"}}>
        {[
          { id:"pases",     label:"Pases de Depósito", icon:"receipt" },
          { id:"depositos", label:"Depósitos",        icon:"box"     },
        ].map(t => (
          <button key={t.id} className="btn btn-sm btn-ghost" style={TAB_STYLE(t.id)} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14}/> {t.label}
            {t.id === "pases" && pasesOrdenados.filter(p => p.estado === "en_transito").length > 0 && (
              <span style={{background:"var(--bg4)", borderRadius:99, padding:"1px 7px", fontSize:10, color:"var(--amber)", marginLeft:2}}>
                {pasesOrdenados.filter(p => p.estado === "en_transito").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: PASES DE DEPÓSITO
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "pases" && (
        <div>
          {/* Toolbar / filtros */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
              <select className="form-select" style={{width:"auto"}} value={fPase.estado} onChange={e => setFP("estado", e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="en_transito">En tránsito</option>
                <option value="recibido">Recibido</option>
                <option value="anulado">Anulado</option>
              </select>
              <select className="form-select" style={{width:"auto"}} value={fPase.origenId} onChange={e => setFP("origenId", e.target.value)}>
                <option value="">Cualquier origen</option>
                {depositos.filter(d => d.tipo !== "transito").map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <select className="form-select" style={{width:"auto"}} value={fPase.destinoId} onChange={e => setFP("destinoId", e.target.value)}>
                <option value="">Cualquier destino</option>
                {depositos.filter(d => d.tipo !== "transito").map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <input className="form-input" type="date" style={{width:140}} value={fPase.desde} onChange={e => setFP("desde", e.target.value)}/>
              <input className="form-input" type="date" style={{width:140}} value={fPase.hasta} onChange={e => setFP("hasta", e.target.value)}/>
              {hayFiltrosPase && (
                <button className="btn btn-sm btn-ghost" onClick={limpiarFiltrosPase} title="Limpiar filtros">
                  <Icon name="close" size={12}/> Limpiar
                </button>
              )}

              <button className="btn btn-sm btn-primary" style={{marginLeft:"auto"}} onClick={() => setModalPase(true)}>
                <Icon name="plus" size={14}/> Nuevo pase
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{fontSize:11, color:"var(--text3)", marginBottom:10, display:"flex", justifyContent:"flex-end"}}>
              {pasesFiltrados.length} de {pasesOrdenados.length} pase{pasesOrdenados.length !== 1 ? "s" : ""}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Productos</th>
                    <th>Estado</th>
                    <th>Usuario</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pasesFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{textAlign:"center", color:"var(--text3)", padding:40}}>
                        {pasesOrdenados.length === 0 ? "Sin pases de depósito registrados" : "Sin resultados para los filtros aplicados"}
                      </td>
                    </tr>
                  )}
                  {pasesPagina.map(p => {
                    const detalle = p.items.map(i => `${i.cantidad}x ${i.productoNombre}`).join(", ");
                    const badge = ESTADO_BADGE[p.estado] || { label:p.estado, cls:"badge-accent" };
                    return (
                      <tr key={p.id}>
                        <td className="mono" style={{fontSize:12, color:"var(--text3)"}}>{fmtFechaAR(p.fecha)}</td>
                        <td style={{color:"var(--text2)"}}>{p.depositoOrigenNombre}</td>
                        <td style={{color:"var(--text1)", fontWeight:500}}>{p.depositoDestinoNombre}</td>
                        <td style={{color:"var(--text2)", fontSize:12, maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={detalle}>
                          {detalle}
                        </td>
                        <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                        <td style={{color:"var(--text3)", fontSize:12}}>{p.usuarioEnvio}</td>
                        <td>
                          {p.estado === "en_transito" && (
                            <div style={{display:"flex", gap:4}}>
                              <button className="btn btn-sm btn-success" title="Recepcionar mercadería" onClick={() => handleRecepcionar(p)}>
                                <Icon name="check" size={13}/> Recepcionar
                              </button>
                              <button className="btn btn-sm btn-ghost" title="Anular pase" style={{color:"var(--red)"}} onClick={() => handleAnular(p)}>
                                <Icon name="close" size={13}/>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Paginacion pagina={paginaPases} totalPaginas={totalPaginasPases} onCambiar={setPaginaPases} totalItems={pasesFiltrados.length} pageSize={pageSizePases} etiqueta="pases" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: DEPÓSITOS
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "depositos" && (
        <div>
          {/* Toolbar / filtros */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
              <div style={{position:"relative", flex:1, minWidth:200}}>
                <Icon name="search" size={14} style={{
                  position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text3)"
                }}/>
                <input
                  className="form-input"
                  style={{paddingLeft:32}}
                  placeholder="Buscar por nombre..."
                  value={buscarDep}
                  onChange={e => setBuscarDep(e.target.value)}
                />
              </div>
              <select className="form-select" style={{width:"auto"}} value={fTipoDep} onChange={e => setFTipoDep(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="normal">Normal</option>
                <option value="reserva">Reservas</option>
                <option value="transito">Tránsito</option>
              </select>
              {esAdmin && (
                <button className="btn btn-sm btn-primary" style={{marginLeft:"auto"}} onClick={() => setModalDeposito({})}>
                  <Icon name="plus" size={14}/> Nuevo depósito
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{fontSize:11, color:"var(--text3)", marginBottom:10, display:"flex", justifyContent:"flex-end"}}>
              {depositosFiltrados.length} de {depositos.length} depósito{depositos.length !== 1 ? "s" : ""}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Stock total</th>
                    {esAdmin && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {depositosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={esAdmin ? 4 : 3} style={{textAlign:"center", color:"var(--text3)", padding:40}}>
                        Sin resultados para los filtros aplicados
                      </td>
                    </tr>
                  )}
                  {depositosFiltrados.map(d => (
                    <tr key={d.id}>
                      <td style={{color:"var(--text1)", fontWeight:500}}>{d.nombre}</td>
                      <td>
                        <span className={`badge ${d.tipo === "transito" ? "badge-blue" : d.tipo === "reserva" ? "badge-accent" : "badge-ok"}`}>
                          {TIPO_LABEL[d.tipo] || d.tipo}
                        </span>
                      </td>
                      <td className="mono" style={{fontWeight:600, color: stockTotalDeposito(d.id) > 0 ? "var(--text1)" : "var(--text3)"}}>
                        {stockTotalDeposito(d.id)}
                      </td>
                      {esAdmin && (
                        <td>
                          <div style={{display:"flex", gap:4}}>
                            <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setModalDeposito(d)}>
                              <Icon name="edit" size={13}/>
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              title={d.tipo === "transito" ? "El depósito de tránsito no puede eliminarse" : "Eliminar"}
                              style={{color: d.tipo === "transito" ? "var(--text3)" : "var(--red)", opacity: d.tipo === "transito" ? 0.5 : 1}}
                              onClick={() => handleEliminarDeposito(d)}
                            >
                              <Icon name="trash" size={13}/>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODALES
      ══════════════════════════════════════════════════════════════════ */}
      {modalDeposito !== null && (
        <ModalDeposito
          deposito={modalDeposito?.id ? modalDeposito : null}
          onGuardar={handleGuardarDeposito}
          onClose={() => setModalDeposito(null)}
        />
      )}

      {modalPase && (
        <ModalNuevoPase
          depositos={depositos}
          stockDepositos={stockDepositos}
          productos={productos.filter(p => p.activo !== false)}
          permitirStockNegativo={permitirStockNegativo}
          onGuardar={handleCrearPase}
          onClose={() => setModalPase(false)}
        />
      )}
    </div>
  );
}
