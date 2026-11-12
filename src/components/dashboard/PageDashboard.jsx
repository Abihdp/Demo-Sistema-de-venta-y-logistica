import { fmt, today, stockMinimo, calcularMoraCliente } from "../../utils/helpers";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import PanelRubrosMasVendidos from "./PanelRubrosMasVendidos";

export default function PageDashboard({ ventas, productos, caja, clientes = [], pagosCtaCte = [], configMora, setPage, reservas = [], cambiosArticulo = [] }) {
  const totalHoy = ventas.filter(v => v.fecha === today()).reduce((a,v) => a+v.total, 0);
  const ventasDelMes = ventas.filter(v => v.fecha.slice(0,7) === today().slice(0,7));
  const totalMes  = ventasDelMes.reduce((a,v) => a+v.total, 0);
  const sinStock  = productos.filter(p => p.stock === 0).length;
  const bajoMin   = productos.filter(p => p.stock > 0 && p.stock < stockMinimo(p)).length;

  const clientesConMora = clientes
    .map(c => calcularMoraCliente(c.id, ventas, pagosCtaCte, configMora, c.configMora, cambiosArticulo))
    .filter(m => m.diasMora > 60 && m.saldoOriginal > 0);
  const totalMoraGrave = clientesConMora.reduce((a,m) => a + m.saldoConRecargo, 0);
  const tieneAlertaMora = clientesConMora.length > 0;

  const reservasListasParaRetirar = reservas.filter(r => r.estado === "pendiente" && Number(r.saldoPendiente) === 0);
  const tieneAlertaReservas = reservasListasParaRetirar.length > 0;

  const productosBajoMinimo = productos.filter(p => p.stock < stockMinimo(p));
  const { pagina: paginaAlertas, setPagina: setPaginaAlertas, totalPaginas: totalPaginasAlertas, itemsPagina: alertasPagina, pageSize: pageSizeAlertas } = usePaginacion(productosBajoMinimo);

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Ventas hoy</div>
          <div className="metric-value">{fmt(totalHoy)}</div>
          <div className="metric-delta up">+12% vs ayer</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ventas del mes</div>
          <div className="metric-value">{fmt(totalMes)}</div>
          <div className="metric-delta">{ventasDelMes.length} comprobantes</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Caja</div>
          <div className="metric-value" style={{color: caja.abierta ? "var(--green)" : "var(--red)"}}>
            {caja.abierta ? "Abierta" : "Cerrada"}
          </div>
          <div className="metric-delta">{caja.abierta ? `Inicio: ${fmt(caja.inicio)}` : "Sin movimientos"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Alertas stock</div>
          <div className="metric-value" style={{color: sinStock+bajoMin > 0 ? "var(--red)" : "var(--green)"}}>
            {sinStock + bajoMin}
          </div>
          <div className="metric-delta down">{sinStock} sin stock · {bajoMin} bajo mínimo</div>
        </div>
      </div>
      {tieneAlertaMora && (
        <div className="card" style={{borderColor:"var(--red)",background:"rgba(220,38,38,0.08)",marginBottom:16}}>
          <div className="card-title" style={{color:"var(--red)"}}>Clientes con más de 60 días de mora</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"14px 18px"}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"var(--red)"}}>{fmt(totalMoraGrave)}</div>
              <div style={{fontSize:12,color:"var(--text3)"}}>{clientesConMora.length} cliente{clientesConMora.length!==1?"s":""} con mora grave</div>
            </div>
            <button className="btn btn-danger" onClick={()=>setPage("clientes")}>Ver vencidos</button>
          </div>
        </div>
      )}
      {tieneAlertaReservas && (
        <div className="card" style={{borderColor:"var(--green)",background:"rgba(22,163,74,0.08)",marginBottom:16}}>
          <div className="card-title" style={{color:"var(--green)"}}>Reservas pagas pendientes de retiro</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"14px 18px"}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"var(--green)"}}>{reservasListasParaRetirar.length}</div>
              <div style={{fontSize:12,color:"var(--text3)"}}>reserva{reservasListasParaRetirar.length!==1?"s":""} totalmente abonada{reservasListasParaRetirar.length!==1?"s":""}, esperando que el cliente retire</div>
            </div>
            <button className="btn btn-ok" onClick={()=>setPage("clientes")}>Ver reservas</button>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <div className="card">
          <div className="card-title">Últimas ventas</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cliente</th><th>Total</th><th>Pago</th><th>Tipo</th></tr></thead>
              <tbody>
                {ventas.slice(-5).reverse().map(v => (
                  <tr key={v.id}>
                    <td style={{color:"var(--text1)"}}>{v.cliente}</td>
                    <td style={{color:"var(--accent2)",fontWeight:600}}>{fmt(v.total)}</td>
                    <td><span className="badge badge-blue">{v.formaPago}</span></td>
                    <td><span className="badge badge-accent">{v.tipo}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Alertas de inventario</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Stock</th><th>Estado</th></tr></thead>
              <tbody>
                {alertasPagina.map(p => (
                  <tr key={p.id}>
                    <td style={{color:"var(--text1)"}}>{p.nombre}</td>
                    <td className="mono">{p.stock}</td>
                    <td>
                      <span className={`badge ${p.stock === 0 ? "badge-danger" : "badge-warn"}`}>
                        {p.stock === 0 ? "Sin stock" : "Bajo mínimo"}
                      </span>
                    </td>
                  </tr>
                ))}
                {productosBajoMinimo.length === 0 &&
                  <tr><td colSpan={3} style={{color:"var(--text3)",textAlign:"center",padding:20}}>Todo en orden</td></tr>}
              </tbody>
            </table>
          </div>

          <Paginacion pagina={paginaAlertas} totalPaginas={totalPaginasAlertas} onCambiar={setPaginaAlertas} totalItems={productosBajoMinimo.length} pageSize={pageSizeAlertas} etiqueta="productos" />
        </div>
      </div>
      <PanelRubrosMasVendidos ventas={ventas} productos={productos} />
    </div>
  );
}

// ─── PAGE: VENTAS ──────────────────────────────────────────────────────────────
