import { useState, useMemo } from "react";
import { calcularSaldosTesoreria, nombresCuentas, esFuenteTesoreria, etiquetaFuente } from "../../utils/tesoreria.js";
import { fmt, today, horaActual, mesLabel, periodoCerrado, fmtFechaAR } from "../../utils/helpers.js";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import ModalNuevoGasto from "./ModalNuevoGasto.jsx";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export default function PageGastos({ gastos, setGastos, planCuentas, proveedores, periodosCerrados = [], caja, tesoreria, compras = [], agregarMovimientoTesoreria, agregarGasto, anularGasto, agregarRetiro, usuarioActivo }) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();

  // Saldo disponible en Tesorería para validar antes de registrar gastos
  // separado en efectivo y banco: el modal valida contra el que corresponde
  // según la forma de pago.
  const saldosTesoreria = useMemo(() => calcularSaldosTesoreria(tesoreria, gastos, compras), [tesoreria, gastos, compras]);
  const nombresCtas = nombresCuentas(planCuentas);
  const [showModal, setShowModal]   = useState(false);
  const [mesFiltro, setMesFiltro]   = useState(() => today().slice(0, 7)); // "YYYY-MM"
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [verAnulados, setVerAnulados] = useState(false);

  const cuentaPorId = useMemo(() => {
    const m = {};
    (planCuentas || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [planCuentas]);

  const categorias = useMemo(() =>
    (planCuentas || []).filter(c => c.tipo === "egreso" && c.imputable && c.id !== "511" && c.id !== "528"),
    [planCuentas]
  );

  const gastosFiltrados = useMemo(() => {
    return (gastos || [])
      .filter(g => mesFiltro ? g.fecha.slice(0, 7) === mesFiltro : true)
      .filter(g => categoriaFiltro ? g.cuentaId === categoriaFiltro : true)
      .filter(g => verAnulados ? true : g.estado !== "anulado")
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [gastos, mesFiltro, categoriaFiltro, verAnulados]);

  const { pagina: paginaGastos, setPagina: setPaginaGastos, totalPaginas: totalPaginasGastos, itemsPagina: gastosPagina, pageSize: pageSizeGastos } = usePaginacion(gastosFiltrados);

  const totalMes = gastosFiltrados
    .filter(g => g.estado !== "anulado")
    .reduce((a, g) => a + g.monto, 0);

  const totalRecurrentes = gastosFiltrados
    .filter(g => g.estado !== "anulado" && g.recurrente)
    .reduce((a, g) => a + g.monto, 0);

  // Top 3 categorías del mes
  const porCategoria = useMemo(() => {
    const map = {};
    gastosFiltrados.filter(g => g.estado !== "anulado").forEach(g => {
      map[g.cuentaId] = (map[g.cuentaId] || 0) + g.monto;
    });
    return Object.entries(map)
      .map(([cuentaId, monto]) => ({ cuentaId, monto, nombre: cuentaPorId[cuentaId]?.nombre || cuentaId }))
      .sort((a, b) => b.monto - a.monto);
  }, [gastosFiltrados, cuentaPorId]);

  const handleAnular = async (id) => {
    const gasto = gastos.find(g => g.id === id);
    const cerrado = gasto && periodoCerrado(gasto.fecha, periodosCerrados);
    if (cerrado) { toast(`El período ${mesLabel(cerrado.mes)} está cerrado. Pedile al administrador que lo reabra desde Tesorería → Cierre de Período.`, "warning"); return; }
    if (!await confirm("¿Anular este gasto? Dejará de impactar en los libros contables.", { danger: true, confirmLabel: "Anular" })) return;
    try {
      await anularGasto(id);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const formaPagoBadge = (fp) => {
    const colorMap = {
      "Efectivo": "var(--green)",
      "Transferencia": "var(--blue)",
      "Cheque": "var(--amber)",
    };
    const c = colorMap[fp] || "var(--text3)";
    return (
      <span style={{
        fontSize:11, padding:"2px 8px", borderRadius:99,
        background:`color-mix(in srgb, ${c} 12%, transparent)`, color:c,
      }}>{fp}</span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18, flexWrap:"wrap" }}>
        <div className="form-group" style={{ minWidth:140 }}>
          <input
            type="month"
            className="form-input"
            value={mesFiltro}
            onChange={e => setMesFiltro(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ minWidth:180 }}
          value={categoriaFiltro}
          onChange={e => setCategoriaFiltro(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--text3)", cursor:"pointer" }}>
          <input
            type="checkbox"
            checked={verAnulados}
            onChange={e => setVerAnulados(e.target.checked)}
            style={{ accentColor:"var(--accent)" }}
          />
          Ver anulados
        </label>

        <button className="btn btn-primary" style={{ marginLeft:"auto" }} onClick={() => setShowModal(true)}>
          <Icon name="plus" size={14} /> Nuevo gasto
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        <div className="metric-card">
          <div className="metric-label">Total gastos del período</div>
          <div className="metric-value" style={{ color:"var(--red)" }}>{fmt(totalMes)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gastos recurrentes</div>
          <div className="metric-value">{fmt(totalRecurrentes)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Cantidad de registros</div>
          <div className="metric-value">{gastosFiltrados.filter(g => g.estado !== "anulado").length}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:16, alignItems:"start" }}>

        {/* Listado */}
        <div className="card" style={{ margin:0 }}>
          <div className="card-title" style={{ marginBottom:12 }}>Gastos registrados</div>
          {gastosFiltrados.length === 0 ? (
            <div style={{ padding:"30px 0", textAlign:"center", color:"var(--text3)", fontSize:13 }}>
              <Icon name="receipt" size={28} /><br/>
              Sin gastos registrados en este período
            </div>
          ) : (
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
              <table style={{ width:"100%" }}>
                <thead>
                  <tr style={{ background:"var(--bg4)", borderBottom:"1px solid var(--border)" }}>
                    {["N°","Fecha","Categoría","Concepto","Forma de pago","Fuente","Monto",""].map((h,i) => (
                      <th key={i} style={{
                        padding:"7px 10px", fontSize:10, fontWeight:600, color:"var(--text3)",
                        textTransform:"uppercase", letterSpacing:".04em",
                        textAlign: i===6 ? "right" : "left"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gastosPagina.map(g => (
                    <tr key={g.id} style={{
                      borderBottom:"1px solid var(--border)",
                      opacity: g.estado === "anulado" ? 0.45 : 1
                    }}>
                      <td style={{ padding:"9px 10px", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)" }}>{g.nro}</td>
                      <td style={{ padding:"9px 10px", fontSize:12, color:"var(--text2)" }}>{fmtFechaAR(g.fecha)}</td>
                      <td style={{ padding:"9px 10px", fontSize:12 }}>
                        <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, background:"color-mix(in srgb, var(--accent) 10%, transparent)", color:"var(--accent2)" }}>
                          {cuentaPorId[g.cuentaId]?.nombre || g.cuentaId}
                        </span>
                      </td>
                      <td style={{ padding:"9px 10px", fontSize:13, color:"var(--text1)" }}>
                        {g.concepto}
                        {g.recurrente && <span style={{ marginLeft:6, fontSize:10, color:"var(--text3)" }}>↻ recurrente</span>}
                        {g.proveedor && <div style={{ fontSize:11, color:"var(--text3)" }}>{g.proveedor}</div>}
                      </td>
                      <td style={{ padding:"9px 10px" }}>{formaPagoBadge(g.formaPago)}</td>
                      <td style={{ padding:"9px 10px" }}>
                        {g.fuente === "caja_salon" && (
                          <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(245,158,11,0.1)", color:"var(--amber)", border:"1px solid rgba(245,158,11,0.2)", whiteSpace:"nowrap" }}>
                            Caja Salón
                          </span>
                        )}
                        {esFuenteTesoreria(g.fuente) && (
                          <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(96,165,250,0.1)", color:"var(--blue)", border:"1px solid rgba(96,165,250,0.2)", whiteSpace:"nowrap" }}>
                            {g.fuente === "tesoreria" ? "Tesorería" : etiquetaFuente(g.fuente, nombresCtas)}
                          </span>
                        )}
                        {(!g.fuente || g.fuente === "sin_impacto") && (
                          <span style={{ fontSize:10, color:"var(--text3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:"9px 10px", textAlign:"right", fontWeight:700, color: g.estado === "anulado" ? "var(--text3)" : "var(--red)" }}>
                        {g.estado === "anulado" ? <s>{fmt(g.monto)}</s> : fmt(g.monto)}
                      </td>
                      <td style={{ padding:"9px 10px" }}>
                        {g.estado !== "anulado" && (
                          <button className="btn btn-sm btn-ghost" onClick={() => handleAnular(g.id)} title="Anular gasto">
                            <Icon name="x" size={13} color="var(--red)" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
                    <td colSpan={6} style={{ padding:"8px 10px", fontSize:12, fontWeight:600, color:"var(--text1)" }}>Total del período</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, color:"var(--red)", fontFamily:"var(--font-mono)" }}>{fmt(totalMes)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Paginacion pagina={paginaGastos} totalPaginas={totalPaginasGastos} onCambiar={setPaginaGastos} totalItems={gastosFiltrados.length} pageSize={pageSizeGastos} etiqueta="gastos" />
        </div>

        {/* Panel lateral: top categorías */}
        <div className="card" style={{ margin:0 }}>
          <div className="card-title" style={{ marginBottom:12 }}>Por categoría</div>
          {porCategoria.length === 0 ? (
            <div style={{ fontSize:12, color:"var(--text3)", textAlign:"center", padding:"16px 0" }}>Sin datos</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {porCategoria.map(c => {
                const pct = totalMes > 0 ? Math.round((c.monto / totalMes) * 100) : 0;
                return (
                  <div key={c.cuentaId}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                      <span style={{ color:"var(--text2)" }}>{c.nombre}</span>
                      <span style={{ color:"var(--text1)", fontWeight:600 }}>{fmt(c.monto)}</span>
                    </div>
                    <div style={{ height:6, background:"var(--bg4)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:"var(--accent)", borderRadius:99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ModalNuevoGasto
          planCuentas={planCuentas}
          proveedores={proveedores}
          gastos={gastos}
          periodosCerrados={periodosCerrados}
          cajaAbierta={caja?.abierta || false}
          saldosTesoreria={saldosTesoreria}
          nombresCuentas={nombresCtas}
          onClose={() => setShowModal(false)}
          onConfirm={async (g) => {
            try {
              const nuevoGasto = await agregarGasto(g);

              // Efecto en Caja Salón: retiro real (tabla caja_retiros — no el
              // blob viejo de `caja.retiros`, que ya no impacta los totales
              // de Caja desde la migración a tablas propias). Caja Salón solo
              // sabe descontar Efectivo o Transferencia (es lo único que
              // entiende el panel de Retiro) — ModalNuevoGasto ya bloquea
              // cualquier otro medio con esta fuente, pero este chequeo queda
              // como segunda barrera: antes, un gasto en Cheque o Tarjeta
              // caía siempre al "else" (Efectivo) y descontaba plata real de
              // la caja por algo que nunca salió de ahí.
              if (g.fuente === "caja_salon" && caja?.abierta && typeof agregarRetiro === "function") {
                if (g.formaPago === "Efectivo" || g.formaPago === "Transferencia") {
                  await agregarRetiro({
                    monto: g.monto,
                    motivo: `Gasto: ${g.concepto}`,
                    cuentaContable: g.cuentaId,
                    medio: g.formaPago,
                    usuario: usuarioActivo?.nombre || null,
                  });
                } else {
                  toast(`Gasto registrado, pero no se descontó de Caja Salón: un pago en ${g.formaPago} no mueve la plata de la caja.`, "warning");
                }
              }

              // Efecto en Tesorería (efectivo, Cuenta Transferencia o banco):
              // registrar egreso. El saldo de cada cuenta sale del gasto mismo
              // (fuente), este movimiento queda como registro.
              if (esFuenteTesoreria(g.fuente) && typeof agregarMovimientoTesoreria === "function") {
                await agregarMovimientoTesoreria({
                  tipo: "Egreso Gasto",
                  fecha: g.fecha,
                  hora: horaActual(),
                  concepto: g.fuente === "tesoreria" ? g.concepto : `${g.concepto} · ${etiquetaFuente(g.fuente, nombresCtas)}`,
                  monto: g.monto,
                  formaPago: g.formaPago,
                  estado: "egreso",
                  gastoId: nuevoGasto.id,
                });
              }

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
