// Listas de precios, formas de pago, condiciones IVA, usuarios

export const COLOR_CODES = {
  "Negro":      "N",
  "Blanco":     "B",
  "Rojo":       "R",
  "Azul":       "A",
  "Verde":      "V",
  "Gris":       "G",
  "Amarillo":   "AM",
  "Naranja":    "OR",
  "Rosa":       "RO",
  "Violeta":    "VL",
  "Marrón":     "MR",
  "Celeste":    "CE",
  "Beige":      "BG",
  "Bordó":      "BD",
  "Multicolor": "MC",
  "Sin color":  "SC",
};

export const COLORES = Object.keys(COLOR_CODES);

// Rubros y sus subrubros posibles (configura la jerarquía de clasificación de productos)
export const RUBROS_SUBRUBROS = {
  "Indumentaria": ["Remeras", "Camisas", "Pantalones", "Shorts", "Vestidos", "Camperas", "Buzos", "Conjuntos", "Otros"],
  "Calzado":      ["Zapatillas", "Botas", "Sandalias", "Alpargatas", "Botines", "Otros"],
  "Accesorios":   ["Mochilas", "Carteras", "Cinturones", "Gorras", "Medias", "Lentes", "Otros"],
  "Deportes":     ["Equipamiento deportivo", "Ropa deportiva", "Calzado deportivo", "Otros"],
  "Otros":        ["General", "Otros"],
};
export const RUBROS = Object.keys(RUBROS_SUBRUBROS);

export const MOTIVOS_ENTRADA = [
  "Compra a proveedor",
  "Devolución de cliente",
  "Ajuste positivo",
  "Producción propia",
  "Carga inicial",
  "Otro",
];

export const MOTIVOS_SALIDA = [
  "Venta directa",
  "Merma / Daño",
  "Ajuste negativo",
  "Pérdida",
  "Muestra",
  "Otro",
];


export const USUARIOS = [
  { id: 1, nombre: "Administrador", rol: "admin",   color: "#7c6fef", pin: "1111" },
  { id: 2, nombre: "María V.",      rol: "cajero",  color: "#3ecf8e", pin: "2222" },
  { id: 3, nombre: "Carlos R.",     rol: "cajero",  color: "#60a5fa", pin: "3333" },
];

export const ROLES = [
  { id: "admin",    label: "Administrador" },
  { id: "cajero",   label: "Cajero"        },
  { id: "vendedor", label: "Vendedor"      },
];

export const ROL_LABEL = { admin: "Administrador", cajero: "Cajero", vendedor: "Vendedor" };

export const COLORES_USUARIO = ["#7c6fef", "#3ecf8e", "#60a5fa", "#f59e0b", "#f26b5b", "#ec4899", "#14b8a6", "#a78bfa"];

// Permisos por usuario — configurables individualmente desde la pantalla de Usuarios.
// Están agrupados por categoría para facilitar la UI.
export const PERMISOS_LABELS = {
  // ── Módulos visibles en el menú lateral ──────────────────────────────────
  verVentas:         { grupo: "Módulos",        label: "Ver Ventas",                  desc: "Acceso al módulo de ventas." },
  verCompras:        { grupo: "Módulos",        label: "Ver Compras",                 desc: "Acceso al módulo de compras y remitos." },
  verCaja:           { grupo: "Módulos",        label: "Ver Caja",                    desc: "Acceso al módulo de caja." },
  verTesoreria:      { grupo: "Módulos",        label: "Ver Tesorería",               desc: "Acceso al módulo de tesorería y períodos contables." },
  verGastos:         { grupo: "Módulos",        label: "Ver Gastos",                  desc: "Acceso al módulo de gastos." },
  verProductos:      { grupo: "Módulos",        label: "Ver Productos",               desc: "Acceso al módulo de productos e inventario." },
  verEtiquetas:      { grupo: "Módulos",        label: "Ver Etiquetas",               desc: "Acceso al módulo de impresión de etiquetas." },
  verDepositos:      { grupo: "Módulos",        label: "Ver Depósitos",               desc: "Acceso al módulo de depósitos." },
  verClientes:       { grupo: "Módulos",        label: "Ver Clientes",                desc: "Acceso al módulo de clientes y cuentas corrientes." },
  // ── Ventas ───────────────────────────────────────────────────────────────
  editarVenta:       { grupo: "Ventas",         label: "Editar ventas propias",       desc: "Puede editar las ventas que registró él mismo." },
  editarVentaAjena:  { grupo: "Ventas",         label: "Editar ventas de otros",      desc: "Sin este permiso, solo puede editar sus propias ventas." },
  anularVenta:       { grupo: "Ventas",         label: "Anular ventas",               desc: "Revierte el stock, el impacto en caja y el saldo de cuenta corriente." },
  cambioArticulo:    { grupo: "Ventas",         label: "Cambio de artículo",          desc: "Puede registrar cambios de artículo." },
  gestionarPreciosVenta: { grupo: "Ventas",     label: "Gestionar listas y promociones", desc: "Crear y editar listas de precios y promociones desde la pantalla de Ventas." },
  // ── Compras ──────────────────────────────────────────────────────────────
  editarRemito:      { grupo: "Compras",        label: "Editar remitos",              desc: "Puede editar remitos y facturas de compra pendientes." },
  // ── Caja ─────────────────────────────────────────────────────────────────
  abrirCaja:         { grupo: "Caja",           label: "Abrir caja",                  desc: "Puede iniciar un nuevo turno de caja." },
  cerrarCaja:        { grupo: "Caja",           label: "Cerrar caja",                 desc: "Puede cerrar el turno de caja actual." },
  generarRetiro:     { grupo: "Caja",           label: "Generar retiro",              desc: "Puede registrar retiros de efectivo durante el turno." },
  // ── Inventario ───────────────────────────────────────────────────────────
  gestionarProductos: { grupo: "Inventario",   label: "Gestionar productos",         desc: "Crear, editar y eliminar productos; importar stock." },
  gestionarDepositos: { grupo: "Inventario",   label: "Gestionar depósitos",         desc: "Crear, editar depósitos y mover stock entre ellos." },
  // ── Administración ───────────────────────────────────────────────────────
  reabrirPeriodo:    { grupo: "Administración", label: "Reabrir período contable",    desc: "Permite reabrir un período ya cerrado en Tesorería." },
  gestionarUsuarios: { grupo: "Administración", label: "Gestionar usuarios",          desc: "Alta, edición, baja y permisos individuales de usuarios." },
};

// Plantillas de permisos por rol (usadas al crear un usuario o resetear sus permisos).
export const PERMISOS_POR_ROL = {
  admin: {
    verVentas: true,  verCompras: true,  verCaja: true,  verTesoreria: true,
    verGastos: true,  verProductos: true, verEtiquetas: true, verDepositos: true, verClientes: true,
    editarVenta: true, editarVentaAjena: true, anularVenta: true, cambioArticulo: true,
    gestionarPreciosVenta: true,
    editarRemito: true,
    abrirCaja: true, cerrarCaja: true, generarRetiro: true,
    gestionarProductos: true, gestionarDepositos: true,
    reabrirPeriodo: true, gestionarUsuarios: true,
  },
  cajero: {
    verVentas: true,  verCompras: false, verCaja: true,  verTesoreria: false,
    verGastos: false, verProductos: false, verEtiquetas: false, verDepositos: false, verClientes: false,
    editarVenta: true, editarVentaAjena: false, anularVenta: false, cambioArticulo: true,
    gestionarPreciosVenta: false,
    editarRemito: false,
    abrirCaja: true, cerrarCaja: true, generarRetiro: true,
    gestionarProductos: false, gestionarDepositos: false,
    reabrirPeriodo: false, gestionarUsuarios: false,
  },
  vendedor: {
    verVentas: true,  verCompras: false, verCaja: false, verTesoreria: false,
    verGastos: false, verProductos: false, verEtiquetas: false, verDepositos: false, verClientes: false,
    editarVenta: false, editarVentaAjena: false, anularVenta: false, cambioArticulo: true,
    gestionarPreciosVenta: false,
    editarRemito: false,
    abrirCaja: false, cerrarCaja: false, generarRetiro: false,
    gestionarProductos: false, gestionarDepositos: false,
    reabrirPeriodo: false, gestionarUsuarios: false,
  },
};

// Mantiene compatibilidad con el import en App.jsx (se migra al formato por userId en el arranque).
export const PERMISOS_DEFAULT = PERMISOS_POR_ROL;

export const LISTAS = [
  { id: 1, nombre: "Lista Mayorista",   pct: 0   },
  { id: 2, nombre: "Lista Minorista",   pct: 15  },
  { id: 3, nombre: "Lista VIP",         pct: 25  },
];

export const FORMAS_PAGO = ["Efectivo", "Tarjeta Débito", "Tarjeta Crédito", "Transferencia", "Cheque", "Mercado Pago", "Cuenta Corriente"];
export const FORMAS_PAGO_COMPRA = ["Efectivo", "Transferencia", "Cheque", "Cuenta Corriente Proveedor"];

// Etiqueta de venta.formaPago cuando se cobró con más de un medio de pago
// (el detalle real queda en venta.pagos: [{ formaPago, monto }]).
export const PAGO_COMBINADO = "Pago combinado";

// Recargo por mora en cuenta corriente — tramos por días de atraso, editables
// desde Clientes. Se aplica el % del tramo más alto cuya cantidad de días sea
// menor o igual a los días de mora de la deuda más antigua sin cubrir.
export const RECARGO_MORA_DEFAULT = [
  { id: 1, dias: 30, pct: 5  },
  { id: 2, dias: 60, pct: 10 },
  { id: 3, dias: 90, pct: 15 },
];

// IVA discriminado (facturación electrónica)
export const ALICUOTAS_IVA = [
  { label: "21%",    value: 21   },
  { label: "10,5%",  value: 10.5 },
  { label: "Exento", value: 0    },
];
export const TIPOS_FACTURA_VENTA  = ["A", "B", "C", "Ticket"];
export const TIPOS_FACTURA_COMPRA = ["A", "B"];

export const COND_IVA = [
  "Responsable Inscripto",
  "Monotributista",
  "Consumidor Final",
  "Exento",
  "No Responsable",
];

export const CUENTAS_CONTABLES = [
  { id:  1, codigo: "1.1.1", nombre: "Caja" },
  { id:  2, codigo: "1.1.2", nombre: "Banco Cuenta Corriente" },
  { id:  3, codigo: "1.1.3", nombre: "Banco Caja de Ahorro" },
  { id:  4, codigo: "2.1.1", nombre: "Proveedores" },
  { id:  5, codigo: "3.1.1", nombre: "Capital Social" },
  { id:  6, codigo: "5.1.1", nombre: "Sueldos y Jornales" },
  { id:  7, codigo: "5.1.2", nombre: "Alquiler" },
  { id:  8, codigo: "5.1.3", nombre: "Servicios Públicos" },
  { id:  9, codigo: "5.1.4", nombre: "Gastos de Administración" },
  { id: 10, codigo: "5.1.5", nombre: "Gastos Bancarios" },
  { id: 11, codigo: "5.1.6", nombre: "Gastos Generales" },
  { id: 12, codigo: "5.1.7", nombre: "Publicidad y Marketing" },
  { id: 13, codigo: "5.1.8", nombre: "Impuestos y Tasas" },
];
