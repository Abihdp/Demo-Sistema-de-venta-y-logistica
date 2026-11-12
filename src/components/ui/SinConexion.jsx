import Icon from "./Icon.jsx";

// Estado de reemplazo para páginas fuera del alcance offline (Compras,
// Tesorería, Productos admin, etc.) cuando no hay conexión real y todavía no
// terminaron de cargar sus datos — evita que queden en blanco o colgadas en
// un loading infinito.
export default function SinConexion({ seccion }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg3)", border: "1px solid var(--border)" }}>
        <Icon name="warning" size={24} color="var(--text3)" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text1)" }}>Sin conexión</div>
      <div style={{ fontSize: 13, color: "var(--text3)", maxWidth: 320, textAlign: "center" }}>
        {seccion ? `${seccion} no está disponible sin internet.` : "Esta sección no está disponible sin internet."} Se va a habilitar solo cuando vuelva la conexión.
      </div>
    </div>
  );
}
