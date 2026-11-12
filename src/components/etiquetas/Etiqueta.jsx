import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { fmt } from "../../utils/helpers.js";

export default function Etiqueta({ producto, precio, config }) {
  const barcodeRef = useRef(null);
  const esTicket = config.estilo === "ticket";

  // El código de barras usa el código del producto. CODE128 acepta letras,
  // números y guiones — cubre códigos internos como "C2078-NEG-M". Si algún
  // código tuviera un caracter no soportado, se cae a un EAN8 con el id.
  useEffect(() => {
    if (!barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, producto.codigo, {
        format: "CODE128",
        width: 1.2,
        height: config.tamanoBarras,
        displayValue: false,
        margin: 2,
      });
    } catch {
      JsBarcode(barcodeRef.current, String(producto.id).padStart(8, "0"), {
        format: "EAN8",
        width: 1.2,
        height: config.tamanoBarras,
        displayValue: false,
        margin: 2,
      });
    }
  }, [producto.codigo, producto.id, config.tamanoBarras, config.estilo]);

  const colorTexto = [
    config.mostrarColor && producto.color,
    config.mostrarTalle && producto.talle,
  ].filter(Boolean).join(" / ");

  if (esTicket) {
    return (
      <div style={{
        width: `${config.ancho}mm`,
        height: `${config.alto}mm`,
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        background: "#fff",
        border: "0.5px solid #ccc",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          padding: "2mm 2mm 2mm 3mm",
          boxSizing: "border-box",
        }}>
          <div style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-evenly",
            alignItems: "flex-start",
            gap: 2,
          }}>
            {config.mostrarNombre && (
              <div style={{
                fontSize: `${config.tamanoNombre}px`,
                fontWeight: 600,
                lineHeight: 1.2,
                color: "#1a1a1a",
                maxWidth: "100%",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                textTransform: "uppercase",
              }}>
                {producto.nombre}
              </div>
            )}

            <svg ref={barcodeRef} style={{ maxWidth: "100%" }} />

            <div style={{
              fontSize: `${config.tamanoCodigo}px`,
              color: "#333",
              letterSpacing: "0.05em",
              fontFamily: "monospace",
            }}>
              {producto.codigo}
            </div>

            {colorTexto && (
              <div style={{ fontSize: `${Math.max(6, config.tamanoNombre - 1)}px`, color: "#444" }}>
                {colorTexto}
              </div>
            )}
          </div>

          {config.mostrarPrecio && (
            <>
              <div style={{
                width: 1,
                alignSelf: "stretch",
                margin: "0 1.5mm",
                background: "rgba(0,0,0,0.35)",
              }} />
              <div style={{
                width: `${Math.max(config.tamanoPrecio * 1.1, 16)}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div style={{
                  transform: "rotate(-90deg)",
                  whiteSpace: "nowrap",
                  fontSize: `${config.tamanoPrecio}px`,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  letterSpacing: "0.03em",
                }}>
                  {fmt(precio)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: `${config.ancho}mm`,
      height: `${config.alto}mm`,
      border: "0.5px solid #ccc",
      borderRadius: 2,
      background: "#fff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2mm",
      boxSizing: "border-box",
      overflow: "hidden",
      fontFamily: "Arial, sans-serif",
    }}>
      {config.mostrarNombre && (
        <div style={{
          fontSize: `${config.tamanoNombre}px`,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.2,
          marginBottom: 1,
          maxWidth: "100%",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          color: "#000",
        }}>
          {producto.nombre}
        </div>
      )}

      {(config.mostrarColor || config.mostrarTalle) && (
        <div style={{ fontSize: `${Math.max(6, config.tamanoNombre - 1)}px`, color: "#555", marginBottom: 1 }}>
          {colorTexto}
        </div>
      )}

      {config.mostrarPrecio && (
        <div style={{
          fontSize: `${config.tamanoPrecio}px`,
          fontWeight: 700,
          color: "#000",
          marginBottom: 2,
        }}>
          {fmt(precio)}
        </div>
      )}

      <svg ref={barcodeRef} style={{ maxWidth: "100%" }} />

      <div style={{
        fontSize: `${config.tamanoCodigo}px`,
        color: "#333",
        letterSpacing: "0.05em",
        marginTop: 1,
        fontFamily: "monospace",
      }}>
        {producto.codigo}
      </div>
    </div>
  );
}
