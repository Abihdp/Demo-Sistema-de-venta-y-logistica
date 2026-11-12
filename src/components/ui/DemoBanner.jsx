import { resetDemo } from "../../lib/supabase";

// Borra todos los datos de la demo (tablas, caché offline, sesión) y recarga
// la página con los datos de ejemplo originales.
function restablecerDemo() {
  if (!confirm("¿Restablecer la demo?\n\nSe borran todos los cambios que hiciste y se vuelven a cargar los datos de ejemplo.")) return;
  resetDemo();
  try { localStorage.removeItem("peco_auth_session"); } catch { /* ignore */ }
  try { indexedDB.deleteDatabase("peco_offline"); } catch { /* ignore */ }
  window.location.reload();
}

export default function DemoBanner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        className="badge badge-warn"
        style={{ fontSize: 11 }}
        title="Versión de demostración: los datos se guardan solo en este navegador"
      >
        DEMO
      </span>
      <button
        className="btn btn-sm"
        style={{ fontSize: 11 }}
        onClick={restablecerDemo}
        title="Borrar los cambios y volver a los datos de ejemplo"
      >
        Restablecer demo
      </button>
    </div>
  );
}
