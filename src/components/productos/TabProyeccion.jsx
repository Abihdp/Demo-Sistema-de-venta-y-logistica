import { useState, useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, today, diasHastaFecha, proyeccionProducto, DIAS_VENTANA_DEFAULT, stockMinimo, fmtFechaAR } from "../../utils/helpers.js";

export default function TabProyeccion({ productos, ventas, proveedores }) {
  const [proveedorId, setProveedorId] = useState(proveedores?.[0]?.id ?? "");
  const [diasVentana, setDiasVentana] = useState(DIAS_VENTANA_DEFAULT);
  const [soloConSugerido, setSoloConSugerido] = useState(true);

  const proveedor = (proveedores || []).find(p => p.id === proveedorId);
  const diasHastaViaje = proveedor ? diasHastaFecha(proveedor.proximoViaje) : null;

  const productosDelProveedor = useMemo(
    () => (productos || []).filter(p => (p.tipo || "simple") !== "madre" && p.proveedorId === proveedorId && p.activo !== false),
    [productos, proveedorId]
  );

  const filas = useMemo(() => {
    return productosDelProveedor.map(p => {
      const proy = proyeccionProducto(p, ventas, proveedor, diasVentana);
      return { producto: p, ...proy };
    });
  }, [productosDelProveedor, ventas, proveedor, diasVentana]);

  const filasFiltradas = soloConSugerido ? filas.filter(f => f.sugerido > 0) : filas;
  const totalUnidades = filasFiltradas.reduce((a, f) => a + (f.sugerido || 0), 0);
  const totalCosto = filasFiltradas.reduce((a, f) => a + (f.sugerido || 0) * f.producto.costo, 0);

  const { pagina: paginaProy, setPagina: setPaginaProy, totalPaginas: totalPaginasProy, itemsPagina: filasPagina, pageSize: pageSizeProy } = usePaginacion(filasFiltradas);

  const sinFechaConfigurada = proveedor && !proveedor.proximoViaje;

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Proveedor</label>
          <select className="form-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
            {(proveedores || []).map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ width: 140 }}>
          <label className="form-label">Ventana de venta</label>
          <select className="form-select" value={diasVentana} onChange={e => setDiasVentana(parseInt(e.target.value))}>
            <option value={15}>Últimos 15 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={60}>Últimos 60 días</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text3)", cursor: "pointer", paddingBottom: 9 }}>
          <input type="checkbox" checked={soloConSugerido} onChange={e => setSoloConSugerido(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          Mostrar solo productos a pedir
        </label>
      </div>

      {/* Estado del proveedor seleccionado */}
      {sinFechaConfigurada ? (
        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 18,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Icon name="warning" size={18} color="var(--amber)" />
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            <strong style={{ color: "var(--amber)" }}>{proveedor.nombre}</strong> no tiene fecha de próximo viaje configurada.
            Editalo desde Proveedores para poder calcular cuánto pedir.
          </div>
        </div>
      ) : proveedor && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
          <div className="metric-card">
            <div className="metric-label">Próximo viaje</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{fmtFechaAR(proveedor.proximoViaje)}</div>
            <div className="metric-delta">
              {diasHastaViaje >= 0 ? `En ${diasHastaViaje} días` : `Hace ${Math.abs(diasHastaViaje)} días`}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Colchón de seguridad</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{proveedor.diasColchon ?? 5} días</div>
            <div className="metric-delta">Cobertura extra por atrasos</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Unidades a pedir</div>
            <div className="metric-value" style={{ fontSize: 18, color: "var(--accent2)" }}>{totalUnidades}</div>
            <div className="metric-delta">{filasFiltradas.length} producto{filasFiltradas.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Costo estimado del pedido</div>
            <div className="metric-value" style={{ fontSize: 18, color: "var(--green)" }}>{fmt(totalCosto)}</div>
            <div className="metric-delta">Según costo actual</div>
          </div>
        </div>
      )}

      {/* Tabla de proyección */}
      <div className="card">
        <div className="card-title">
          Proyección por producto
          <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text3)", fontSize: 11 }}>
            Venta promedio sobre los últimos {diasVentana} días
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: "right" }}>Stock actual</th>
                <th style={{ textAlign: "right" }}>Venta prom./día</th>
                <th style={{ textAlign: "right" }}>Días a cubrir</th>
                <th style={{ textAlign: "right" }}>Necesario</th>
                <th style={{ textAlign: "right" }}>Sugerido a pedir</th>
                <th style={{ textAlign: "right" }}>Costo estimado</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: 30 }}>
                    {sinFechaConfigurada
                      ? "Configurá la fecha de próximo viaje para ver la proyección"
                      : "No hay productos que necesiten reposición"}
                  </td>
                </tr>
              ) : filasPagina.map(f => (
                <tr key={f.producto.id}>
                  <td>
                    <div style={{ color: "var(--text1)", fontWeight: 500 }}>{f.producto.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{f.producto.codigo}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`badge ${f.producto.stock === 0 ? "badge-danger" : f.producto.stock < stockMinimo(f.producto) ? "badge-warn" : "badge-ok"}`}>
                      {f.producto.stock}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", color: "var(--text2)" }}>
                    {f.promedioDiario.toFixed(2)}
                  </td>
                  <td style={{ textAlign: "right", color: "var(--text2)" }}>
                    {f.diasACubrir ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", color: "var(--text3)" }}>
                    {f.necesario != null ? f.necesario.toFixed(1) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: f.sugerido > 0 ? "var(--accent2)" : "var(--text3)" }}>
                      {f.sugerido ?? "—"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>
                    {f.sugerido != null ? fmt(f.sugerido * f.producto.costo) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {filasFiltradas.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border2)", background: "var(--bg4)" }}>
                  <td colSpan={5} style={{ fontWeight: 600, color: "var(--text1)" }}>Total a pedir</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent2)" }}>{totalUnidades}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--green)" }}>{fmt(totalCosto)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <Paginacion pagina={paginaProy} totalPaginas={totalPaginasProy} onCambiar={setPaginaProy} totalItems={filasFiltradas.length} pageSize={pageSizeProy} etiqueta="productos" />
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
        El cálculo proyecta cuántas unidades se van a vender hasta el próximo viaje (más el colchón de seguridad)
        y resta el stock actual. Productos sin ventas en el período seleccionado o con stock suficiente no requieren pedido.
      </div>
    </div>
  );
}
