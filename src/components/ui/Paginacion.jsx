export default function Paginacion({ pagina, totalPaginas, onCambiar, totalItems, pageSize, etiqueta = "resultados" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
      <span style={{ fontSize: 12, color: "var(--text3)" }}>
        {totalItems === 0
          ? `0 ${etiqueta}`
          : `Mostrando ${(pagina - 1) * pageSize + 1}–${Math.min(pagina * pageSize, totalItems)} de ${totalItems}`}
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-sm btn-ghost" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          ‹ Anterior
        </button>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>Página {pagina} de {totalPaginas}</span>
        <button className="btn btn-sm btn-ghost" disabled={pagina >= totalPaginas} onClick={() => onCambiar(pagina + 1)}>
          Siguiente ›
        </button>
      </div>
    </div>
  );
}
