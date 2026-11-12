import { useState, useMemo } from "react";
import { fmt, today, fmtFechaAR } from "../../utils/helpers";
import { abrirReporteImpresion, descargarExcel, arMoney, generadoEl, REPORTE_ESTILOS } from "../../utils/reportes";
import Icon from "../ui/Icon";

// ─── Utilidades internas ───────────────────────────────────────────────────────
function subDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function ventasPorCategoria(ventas, productos, desde, hasta) {
  const productoPorNombre = {};
  (productos || []).forEach(p => { productoPorNombre[p.nombre] = p; });

  const porCategoria = {};
  (ventas || [])
    .filter(v => v.estado !== "anulada" && (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta))
    .forEach(v => {
      (v.items || []).forEach(item => {
        const prod = productoPorNombre[item.nombre];
        const categoria = prod?.rubro || prod?.categoria || "Sin rubro";
        if (!porCategoria[categoria]) {
          porCategoria[categoria] = { categoria, cantidad: 0, monto: 0 };
        }
        porCategoria[categoria].cantidad += item.qty;
        porCategoria[categoria].monto += item.qty * item.precio;
      });
    });

  return Object.values(porCategoria);
}

function rangoAnterior(desde, hasta) {
  if (!desde || !hasta) return null;
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  const hastaAnt = new Date(d1);
  hastaAnt.setDate(hastaAnt.getDate() - 1);
  const desdeAnt = new Date(hastaAnt);
  desdeAnt.setDate(desdeAnt.getDate() - (dias - 1));
  return {
    desde: desdeAnt.toISOString().slice(0, 10),
    hasta: hastaAnt.toISOString().slice(0, 10),
  };
}

function buildRubrosHTML({ periodoLabel, metrica, ranking, totalGeneral }) {
  const filas = ranking.map((r, i) => `
    <tr><td>${i + 1}</td><td>${r.categoria}</td><td class="num">${r.cantidad.toLocaleString("es-AR")}</td><td class="num">${arMoney(r.monto)}</td></tr>
  `).join("") || `<tr><td colspan="4">Sin ventas registradas en el período</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Ventas por Rubro — ${periodoLabel}</title>
<style>${REPORTE_ESTILOS}</style></head><body>
<h2>Ventas por Rubro</h2>
<p class="sub">Período: ${periodoLabel} &nbsp;·&nbsp; Ordenado por ${metrica === "monto" ? "monto" : "cantidad"} &nbsp;·&nbsp; Generado: ${generadoEl()}</p>

<table>
  <thead><tr><th>#</th><th>Rubro / Categoría</th><th class="num">Unidades</th><th class="num">Monto total</th></tr></thead>
  <tbody>${filas}<tr class="total"><td colspan="2">Total</td><td class="num">${totalGeneral.cantidad.toLocaleString("es-AR")}</td><td class="num">${arMoney(totalGeneral.monto)}</td></tr></tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PanelRubrosMasVendidos({ ventas, productos }) {
  const hoy = today();
  const [desde,   setDesde]   = useState(() => subDays(hoy, 30));
  const [hasta,   setHasta]   = useState(hoy);
  const [topN,    setTopN]    = useState(10);
  const [metrica, setMetrica] = useState("monto"); // "monto" | "cantidad"

  const { ranking, totalGeneral, mapaAnterior } = useMemo(() => {
    const datos = ventasPorCategoria(ventas, productos, desde, hasta);

    const totalGeneral = {
      cantidad: datos.reduce((a, d) => a + d.cantidad, 0),
      monto:    datos.reduce((a, d) => a + d.monto,    0),
    };

    const top = Number(topN) || 10;
    const ranking = [...datos]
      .sort((a, b) => metrica === "monto" ? b.monto - a.monto : b.cantidad - a.cantidad)
      .slice(0, top);

    const rango = rangoAnterior(desde, hasta);
    const mapaAnterior = {};
    if (rango) {
      ventasPorCategoria(ventas, productos, rango.desde, rango.hasta)
        .forEach(d => { mapaAnterior[d.categoria] = d; });
    }

    return { ranking, totalGeneral, mapaAnterior };
  }, [ventas, productos, desde, hasta, topN, metrica]);

  const maxValor = ranking.length > 0
    ? (metrica === "monto" ? ranking[0].monto : ranking[0].cantidad)
    : 1;

  // Calcular crecimiento para cada categoría del ranking
  const rankingConCrecimiento = ranking.map(r => {
    const ant = mapaAnterior[r.categoria];
    const actual   = metrica === "monto" ? r.monto    : r.cantidad;
    const anterior = ant ? (metrica === "monto" ? ant.monto : ant.cantidad) : 0;
    const pct = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
    return { ...r, anterior, pct };
  });

  const lider = rankingConCrecimiento[0] ?? null;

  const mayorCrecimiento = rankingConCrecimiento
    .filter(r => r.pct !== null)
    .reduce((best, r) => (best === null || r.pct > best.pct ? r : best), null);

  const periodoLabel = `${fmtFechaAR(desde)} al ${fmtFechaAR(hasta)}`;
  const handlePrint = () => abrirReporteImpresion(buildRubrosHTML({ periodoLabel, metrica, ranking: rankingConCrecimiento, totalGeneral }));
  const handleExportExcel = () => {
    descargarExcel([
      { nombre: "Rubros", filas: rankingConCrecimiento.map((r, i) => ({ "#": i + 1, Rubro: r.categoria, Unidades: r.cantidad, Monto: Math.round(r.monto) })) },
    ], `ventas-por-rubro_${today()}.xlsx`);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Rubros Más Vendidos</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={handleExportExcel} title="Exportar a Excel">
            <Icon name="download" size={13}/> Excel
          </button>
          <button className="btn btn-sm btn-ghost" onClick={handlePrint} title="Imprimir reporte">
            <Icon name="printer" size={13}/> Imprimir
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>Desde</div>
          <input type="date" className="form-input" style={{ width: 140 }}
            value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>Hasta</div>
          <input type="date" className="form-input" style={{ width: 140 }}
            value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>Top</div>
          <input type="number" className="form-input" style={{ width: 70 }}
            min={1} max={50} value={topN} onChange={e => setTopN(e.target.value)} />
        </div>
        <div style={{ display: "flex", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[["monto", "Por monto"], ["cantidad", "Por cantidad"]].map(([val, label]) => (
            <button key={val} onClick={() => setMetrica(val)} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
              background: metrica === val ? "var(--accent)" : "transparent",
              color:      metrica === val ? "#fff" : "var(--text2)",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Tabla ranking ── */}
      <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 14 }}>
        {ranking.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            Sin ventas registradas en el período seleccionado
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Rubro / Categoría", "Unidades", "Monto total", "% participación", "Proporción"].map((h, i) => (
                  <th key={h} style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)",
                    textTransform: "uppercase", letterSpacing: ".04em",
                    textAlign: i === 0 ? "center" : "left",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankingConCrecimiento.map((r, i) => {
                const valor         = metrica === "monto" ? r.monto    : r.cantidad;
                const totalRef      = totalGeneral[metrica];
                const pctParticip   = totalRef > 0 ? ((valor / totalRef) * 100).toFixed(1) : "0.0";
                const barWidth      = maxValor > 0 ? Math.round((valor / maxValor) * 100) : 0;
                const esLider       = i === 0;

                return (
                  <tr key={r.categoria} style={{ borderBottom: "1px solid var(--border)" }}>
                    {/* # */}
                    <td style={{ padding: "9px 12px", textAlign: "center", width: 36 }}>
                      {esLider
                        ? <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 14 }}>1°</span>
                        : <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>{i + 1}</span>
                      }
                    </td>
                    {/* Categoría */}
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text1)" }}>{r.categoria}</span>
                      {r.pct !== null && (
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 600,
                          color: r.pct >= 0 ? "var(--green)" : "var(--red)",
                        }}>
                          {r.pct >= 0 ? "▲" : "▼"} {Math.abs(r.pct).toFixed(0)}%
                        </span>
                      )}
                      {r.pct === null && r.anterior === 0 && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>NUEVO</span>
                      )}
                    </td>
                    {/* Unidades */}
                    <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text2)" }}>
                      {r.cantidad.toLocaleString("es-AR")}
                    </td>
                    {/* Monto */}
                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--accent2)" }}>
                      {fmt(r.monto)}
                    </td>
                    {/* % participación */}
                    <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text2)" }}>
                      {pctParticip}%
                    </td>
                    {/* Barra */}
                    <td style={{ padding: "9px 12px", minWidth: 110 }}>
                      <div style={{ background: "var(--bg4)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                        <div style={{
                          width: `${barWidth}%`, height: "100%", borderRadius: 99,
                          background: esLider ? "var(--accent)" : "var(--accent2)",
                          transition: "width .3s",
                        }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Comparativa ── */}
      {ranking.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Líder */}
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
              Categoría líder del período
            </div>
            {lider ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)", marginBottom: 4 }}>{lider.categoria}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  {fmt(lider.monto)} · {lider.cantidad.toLocaleString("es-AR")} unidades
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)" }}>—</div>
            )}
          </div>

          {/* Mayor crecimiento */}
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
              Mayor crecimiento vs período anterior
            </div>
            {mayorCrecimiento ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)", marginBottom: 4 }}>{mayorCrecimiento.categoria}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: mayorCrecimiento.pct >= 0 ? "var(--green)" : "var(--red)" }}>
                    {mayorCrecimiento.pct >= 0 ? "▲" : "▼"} {Math.abs(mayorCrecimiento.pct).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>vs período anterior</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)" }}>
                Sin datos del período anterior para comparar
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
