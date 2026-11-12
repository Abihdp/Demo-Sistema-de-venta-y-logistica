import { useState, useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import { listarImpresoras, IMPRESORA_LOCALSTORAGE_KEY } from "../../utils/agenteImpresion.js";

// Elegir a qué impresora de ESTA pc van los tickets — pensado para PCs que
// rotan entre mostradores con impresora térmica propia cada uno. Si no hay
// agente local corriendo, no se muestra nada (no aplica: se imprime como
// siempre con el diálogo de Windows).
export default function SelectorImpresora() {
  const [impresoras, setImpresoras] = useState(null); // null = agente no disponible
  const [seleccion, setSeleccion]   = useState(() => localStorage.getItem(IMPRESORA_LOCALSTORAGE_KEY) || "");
  const [abierto, setAbierto]       = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    listarImpresoras().then(setImpresoras);
  }, []);

  useEffect(() => {
    const onClickFuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  if (!impresoras || impresoras.length === 0) return null;

  const elegir = (nombre) => {
    setSeleccion(nombre);
    if (nombre) localStorage.setItem(IMPRESORA_LOCALSTORAGE_KEY, nombre);
    else localStorage.removeItem(IMPRESORA_LOCALSTORAGE_KEY);
    setAbierto(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => setAbierto(v => !v)}
        title="Impresora de ticket para esta PC"
        style={{ maxWidth: 180 }}
      >
        <Icon name="printer" size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {seleccion || "Predeterminada"}
        </span>
      </button>

      {abierto && (
        <div style={{
          position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 30,
          background: "var(--bg3)", border: "1px solid var(--border2)",
          borderRadius: "var(--radius-sm)", minWidth: 220,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden",
        }}>
          <button
            onClick={() => elegir("")}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
              fontSize: 12, border: "none", cursor: "pointer",
              background: !seleccion ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: !seleccion ? "var(--accent2)" : "var(--text2)", fontWeight: !seleccion ? 600 : 400,
            }}
          >
            Predeterminada de Windows
          </button>
          <div style={{ height: 1, background: "var(--border)" }} />
          {impresoras.map(nombre => (
            <button
              key={nombre}
              onClick={() => elegir(nombre)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                fontSize: 12, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
                background: seleccion === nombre ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                color: seleccion === nombre ? "var(--accent2)" : "var(--text2)", fontWeight: seleccion === nombre ? 600 : 400,
              }}
            >
              {nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
