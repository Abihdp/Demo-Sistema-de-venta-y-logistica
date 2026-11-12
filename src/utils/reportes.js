import * as XLSX from "xlsx";

// ─── Reportes: HTML imprimible / exportable ───────────────────────────────────
export const REPORTE_ESTILOS = `
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h2 { margin-bottom: 4px; }
  p.sub { color: #666; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
  th { background: #2c2c54; color: #fff; padding: 9px 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f5f5f5; border-top: 2px solid #ccc; }
  h3 { margin: 22px 0 8px; font-size: 14px; }
  .footer { margin-top: 24px; font-size: 11px; color: #999; }
  .pos { color: #27ae60; } .neg { color: #c0392b; }
`;
export const arMoney = n => "$" + Math.round(n).toLocaleString("es-AR");
export const generadoEl = () => new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

export function abrirReporteImpresion(html) {
  const htmlPrint = html.replace("</body>", "<script>window.onload=function(){window.print();}<\/script></body>");
  const blob = new Blob([htmlPrint], { type: "text/html;charset=utf-8;" });
  window.open(URL.createObjectURL(blob), "_blank");
}
export function descargarReporteHTML(html, nombreArchivo) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
}
export function descargarExcel(hojas, nombreArchivo) {
  const wb = XLSX.utils.book_new();
  hojas.forEach(({ nombre, filas }) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombre);
  });
  const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}
