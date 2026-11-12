import { useState, useMemo } from "react";
import { fmt, today, fmtFechaAR } from "../../utils/helpers.js";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import ModalNuevoCheque from "./ModalNuevoCheque.jsx";
import { useToast } from "../ui/Toast.jsx";

function diasHasta(fechaStr) {
  const hoy = new Date(today());
  const venc = new Date(fechaStr);
  return Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
}

function VencimientoBadge({ fechaVencimiento, estado }) {
  if (estado !== "en_cartera") return null;
  const dias = diasHasta(fechaVencimiento);
  if (dias < 0) return <span className="badge badge-danger">Vencido hace {Math.abs(dias)}d</span>;
  if (dias === 0) return <span className="badge badge-warn">Vence hoy</span>;
  if (dias <= 7) return <span className="badge badge-warn">Vence en {dias}d</span>;
  return <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text3)" }}>{dias}d</span>;
}

export default function TabCheques({ cheques, setCheques, clientes, proveedores, agregarCheque, cambiarEstadoCheque }) {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState(""); // "" | "recibido" | "emitido"
  const [estadoFiltro, setEstadoFiltro] = useState(""); // "" | en_cartera | depositado | rechazado | entregado

  const chequesFiltrados = useMemo(() => {
    return (cheques || [])
      .filter(c => tipoFiltro ? c.tipo === tipoFiltro : true)
      .filter(c => estadoFiltro ? c.estado === estadoFiltro : true)
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  }, [cheques, tipoFiltro, estadoFiltro]);

  const { pagina: paginaCheques, setPagina: setPaginaCheques, totalPaginas: totalPaginasCheques, itemsPagina: chequesPagina, pageSize: pageSizeCheques } = usePaginacion(chequesFiltrados);

  const enCartera = (cheques || []).filter(c => c.estado === "en_cartera");
  const totalRecibidosCartera = enCartera.filter(c => c.tipo === "recibido").reduce((a, c) => a + c.monto, 0);
  const totalEmitidosCartera  = enCartera.filter(c => c.tipo === "emitido").reduce((a, c) => a + c.monto, 0);
  const vencenEstaSemana = enCartera.filter(c => {
    const d = diasHasta(c.fechaVencimiento);
    return d >= 0 && d <= 7;
  });
  const vencidos = enCartera.filter(c => diasHasta(c.fechaVencimiento) < 0);

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await cambiarEstadoCheque(id, nuevoEstado);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const estadoBadge = (estado) => ({
    en_cartera: <span className="badge badge-blue">En cartera</span>,
    depositado: <span className="badge badge-ok">Depositado</span>,
    rechazado:  <span className="badge badge-danger">Rechazado</span>,
    entregado:  <span className="badge badge-ok">Entregado</span>,
  })[estado] || <span className="badge">{estado}</span>;

  return (
    <div>
      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">Recibidos en cartera</div>
          <div className="metric-value" style={{ color: "var(--green)" }}>{fmt(totalRecibidosCartera)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Emitidos en cartera</div>
          <div className="metric-value" style={{ color: "var(--red)" }}>{fmt(totalEmitidosCartera)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Vencen esta semana</div>
          <div className="metric-value" style={{ color: vencenEstaSemana.length > 0 ? "var(--amber)" : "var(--text1)" }}>
            {vencenEstaSemana.length}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Vencidos sin gestionar</div>
          <div className="metric-value" style={{ color: vencidos.length > 0 ? "var(--red)" : "var(--text1)" }}>
            {vencidos.length}
          </div>
        </div>
      </div>

      {/* Filtros + nuevo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="form-select" style={{ minWidth: 160 }} value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="recibido">Recibidos</option>
          <option value="emitido">Emitidos</option>
        </select>
        <select className="form-select" style={{ minWidth: 160 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="en_cartera">En cartera</option>
          <option value="depositado">Depositado</option>
          <option value="rechazado">Rechazado</option>
          <option value="entregado">Entregado</option>
        </select>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowModal(true)}>
          <Icon name="plus" size={14} /> Nuevo cheque
        </button>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="card-title">Cartera de cheques</div>
        {chequesFiltrados.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            <Icon name="receipt" size={28} /><br/>
            Sin cheques registrados
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th><th>Tipo</th><th>Banco</th><th>Asociado a</th>
                  <th>Vencimiento</th><th>Monto</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {chequesPagina.map(c => (
                  <tr key={c.id} style={{ opacity: c.estado === "rechazado" ? 0.6 : 1 }}>
                    <td className="mono" style={{ color: "var(--text3)", fontSize: 11 }}>{c.numero}</td>
                    <td>
                      <span className={`badge ${c.tipo === "recibido" ? "badge-ok" : "badge-warn"}`}>
                        {c.tipo === "recibido" ? "Recibido" : "Emitido"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{c.banco}</td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>{c.cliente || c.proveedor || "—"}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12 }}>{fmtFechaAR(c.fechaVencimiento)}</span>
                        <VencimientoBadge fechaVencimiento={c.fechaVencimiento} estado={c.estado} />
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: c.tipo === "recibido" ? "var(--green)" : "var(--red)" }}>
                      {fmt(c.monto)}
                    </td>
                    <td>{estadoBadge(c.estado)}</td>
                    <td>
                      {c.estado === "en_cartera" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {c.tipo === "recibido" ? (
                            <>
                              <button className="btn btn-sm" onClick={() => cambiarEstado(c.id, "depositado")} title="Marcar como depositado">
                                Depositar
                              </button>
                              <button className="btn btn-sm btn-danger" onClick={() => cambiarEstado(c.id, "rechazado")} title="Marcar como rechazado">
                                Rechazar
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-sm" onClick={() => cambiarEstado(c.id, "entregado")} title="Marcar como entregado al proveedor">
                              Marcar entregado
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion pagina={paginaCheques} totalPaginas={totalPaginasCheques} onCambiar={setPaginaCheques} totalItems={chequesFiltrados.length} pageSize={pageSizeCheques} etiqueta="cheques" />
      </div>

      {showModal && (
        <ModalNuevoCheque
          clientes={clientes}
          proveedores={proveedores}
          cheques={cheques}
          onClose={() => setShowModal(false)}
          onConfirm={async (data) => {
            try {
              await agregarCheque(data);
              setShowModal(false);
            } catch (err) {
              toast(err.message, "error");
            }
          }}
        />
      )}
    </div>
  );
}