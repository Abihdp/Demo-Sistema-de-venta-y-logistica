// Datos de prueba (seed). Reemplazar por llamadas a Supabase.

export const initialProductos = [
  { id:1, codigoBase:"RO-NEG-M", codigo:"RO-NEG-M", nombre:"Remera Oversize Negro M", rubro:"Indumentaria", subrubro:"Remeras",    color:"Negro",  talle:"M",  costo:2800,  precio:5500,  stock:18, proveedorId:1, activo:true },
  { id:2, codigoBase:"RO-NEG-L", codigo:"RO-NEG-L", nombre:"Remera Oversize Negro L", rubro:"Indumentaria", subrubro:"Remeras",    color:"Negro",  talle:"L",  costo:2800,  precio:5500,  stock:3,  proveedorId:1, activo:true },
  { id:3, codigoBase:"ZR-42",    codigo:"ZR-42",    nombre:"Zapatilla Running 42",    rubro:"Calzado",      subrubro:"Zapatillas", color:"Blanco", talle:"42", costo:12000, precio:22500, stock:0,  proveedorId:2, activo:true },
  { id:4, codigoBase:"SD-M",     codigo:"SD-M",     nombre:"Short Deportivo M",       rubro:"Indumentaria", subrubro:"Shorts",     color:"Azul",   talle:"M",  costo:1900,  precio:3800,  stock:24, proveedorId:1, activo:true },
  { id:5, codigoBase:"MU-001",   codigo:"MU-001",   nombre:"Mochila Urbana",          rubro:"Accesorios",   subrubro:"Mochilas",   color:"Negro",  talle:"",   costo:5500,  precio:11000, stock:7,  proveedorId:3, activo:true },
  { id:6, codigoBase:"MP-3",     codigo:"MP-3",     nombre:"Medias Pack x3",          rubro:"Accesorios",   subrubro:"Medias",     color:"Blanco", talle:"",   costo:600,   precio:1500,  stock:45, proveedorId:3, activo:true },
];

export const initialClientes = [
  { id:1, nombre:"Juan Pérez",      dni:"28.345.678", tel:"381-555-0001", dir:"Av. Aconquija 1234", iva:"Consumidor Final"      },
  { id:2, nombre:"María García",    dni:"31.222.111", tel:"381-555-0002", dir:"San Martín 456",     iva:"Responsable Inscripto" },
  { id:3, nombre:"Carlos López",    dni:"25.888.999", tel:"381-555-0003", dir:"Belgrano 789",       iva:"Monotributista"        },
  { id:4, nombre:"Laura Méndez",    dni:"33.100.200", tel:"381-555-0004", dir:"Independencia 321",  iva:"Consumidor Final"      },
  { id:5, nombre:"Roberto Soria",   dni:"22.987.654", tel:"381-555-0005", dir:"Corrientes 890",     iva:"Responsable Inscripto" },
];

export const initialVentas = [
  // Juan Pérez — mezcla efectivo + cuenta corriente
  { id:1,  fecha:"2026-04-10", clienteId:1, cliente:"Juan Pérez",   lista:"Lista Minorista", formaPago:"Efectivo",         tipo:"Mostrador",   total:11000,  items:[{nombre:"Remera Oversize Negro M",qty:2,precio:5500}] },
  { id:2,  fecha:"2026-04-25", clienteId:1, cliente:"Juan Pérez",   lista:"Lista Minorista", formaPago:"Cuenta Corriente", tipo:"Mostrador",   total:7600,   items:[{nombre:"Short Deportivo M",qty:1,precio:3800},{nombre:"Medias Pack x3",qty:2,precio:1500}] },
  { id:3,  fecha:"2026-05-08", clienteId:1, cliente:"Juan Pérez",   lista:"Lista Minorista", formaPago:"Cuenta Corriente", tipo:"Mostrador",   total:11000,  items:[{nombre:"Remera Oversize Negro M",qty:2,precio:5500}] },
  { id:4,  fecha:"2026-05-20", clienteId:1, cliente:"Juan Pérez",   lista:"Lista Minorista", formaPago:"Efectivo",         tipo:"Mostrador",   total:7600,   items:[{nombre:"Short Deportivo M",qty:2,precio:3800}] },
  // María García — cuenta corriente con pagos parciales
  { id:5,  fecha:"2026-04-15", clienteId:2, cliente:"María García", lista:"Lista Tarjeta",       formaPago:"Cuenta Corriente", tipo:"Comprobante", total:22500,  items:[{nombre:"Zapatilla Running 42",qty:1,precio:22500}] },
  { id:6,  fecha:"2026-05-01", clienteId:2, cliente:"María García", lista:"Lista Tarjeta",       formaPago:"Transferencia",    tipo:"Comprobante", total:33000,  items:[{nombre:"Remera Oversize Negro M",qty:3,precio:5500},{nombre:"Mochila Urbana",qty:1,precio:11000}] },  
  { id:7,  fecha:"2026-05-18", clienteId:2, cliente:"María García", lista:"Lista Tarjeta",       formaPago:"Cuenta Corriente", tipo:"Comprobante", total:11000,  items:[{nombre:"Mochila Urbana",qty:1,precio:11000}] },
  // Carlos López — solo efectivo
  { id:8,  fecha:"2026-05-03", clienteId:3, cliente:"Carlos López", lista:"Lista Minorista", formaPago:"Tarjeta Débito",   tipo:"Mostrador",   total:5300,   items:[{nombre:"Short Deportivo M",qty:1,precio:3800},{nombre:"Medias Pack x3",qty:1,precio:1500}] },
  { id:9,  fecha:"2026-06-01", clienteId:3, cliente:"Carlos López", lista:"Lista Minorista", formaPago:"Efectivo",         tipo:"Mostrador",   total:3800,   items:[{nombre:"Short Deportivo M",qty:1,precio:3800}] },
  // Laura Méndez — cuenta corriente
  { id:10, fecha:"2026-05-10", clienteId:4, cliente:"Laura Méndez", lista:"Lista Minorista", formaPago:"Cuenta Corriente", tipo:"Mostrador",   total:16500,  items:[{nombre:"Remera Oversize Negro M",qty:1,precio:5500},{nombre:"Mochila Urbana",qty:1,precio:11000}] },
  { id:11, fecha:"2026-05-28", clienteId:4, cliente:"Laura Méndez", lista:"Lista Minorista", formaPago:"Cuenta Corriente", tipo:"Mostrador",   total:7600,   items:[{nombre:"Short Deportivo M",qty:2,precio:3800}] },
  // Roberto Soria — cuenta corriente con un pago
  { id:12, fecha:"2026-04-20", clienteId:5, cliente:"Roberto Soria",lista:"Lista Tarjeta",       formaPago:"Cuenta Corriente", tipo:"Comprobante", total:45000,  items:[{nombre:"Zapatilla Running 42",qty:2,precio:22500}] },
  { id:13, fecha:"2026-05-15", clienteId:5, cliente:"Roberto Soria",lista:"Lista Tarjeta",       formaPago:"Efectivo",         tipo:"Comprobante", total:22000,  items:[{nombre:"Mochila Urbana",qty:2,precio:11000}] },
  // Consumidor final
  { id:14, fecha:"2026-06-03", clienteId:null, cliente:"Consumidor Final", lista:"Lista Minorista", formaPago:"Tarjeta Débito", tipo:"Mostrador", total:5300, items:[{nombre:"Short Deportivo M",qty:1,precio:3800},{nombre:"Medias Pack x3",qty:1,precio:1500}] },
];

// Depósitos
export const initialDepositos = [
  { id:1, nombre:"Depósito Principal", tipo:"normal"   },
  { id:2, nombre:"Depósito Sucursal",  tipo:"normal"   },
  { id:3, nombre:"Depósito Reservas",  tipo:"reserva"  },
  { id:4, nombre:"Depósito Tránsito",  tipo:"transito" },
];

// Stock por depósito — suma por producto debe coincidir con producto.stock
export const initialStockDepositos = [
  // Depósito Principal
  { id:1,  productoId:1, depositoId:1, cantidad:15 },
  { id:2,  productoId:2, depositoId:1, cantidad:2  },
  { id:3,  productoId:3, depositoId:1, cantidad:0  },
  { id:4,  productoId:4, depositoId:1, cantidad:20 },
  { id:5,  productoId:5, depositoId:1, cantidad:7  },
  { id:6,  productoId:6, depositoId:1, cantidad:40 },
  // Depósito Sucursal
  { id:7,  productoId:1, depositoId:2, cantidad:3  },
  { id:8,  productoId:2, depositoId:2, cantidad:1  },
  { id:9,  productoId:4, depositoId:2, cantidad:4  },
  { id:10, productoId:6, depositoId:2, cantidad:5  },
  // Depósito Reservas (inicia vacío)
  { id:11, productoId:1, depositoId:3, cantidad:0  },
  { id:12, productoId:2, depositoId:3, cantidad:0  },
  { id:13, productoId:3, depositoId:3, cantidad:0  },
  { id:14, productoId:4, depositoId:3, cantidad:0  },
  { id:15, productoId:5, depositoId:3, cantidad:0  },
  { id:16, productoId:6, depositoId:3, cantidad:0  },
  // Depósito Tránsito (inicia vacío — solo contiene mercadería en viaje)
  { id:17, productoId:1, depositoId:4, cantidad:0  },
  { id:18, productoId:2, depositoId:4, cantidad:0  },
  { id:19, productoId:3, depositoId:4, cantidad:0  },
  { id:20, productoId:4, depositoId:4, cantidad:0  },
  { id:21, productoId:5, depositoId:4, cantidad:0  },
  { id:22, productoId:6, depositoId:4, cantidad:0  },
];

// Transferencias entre depósitos (pases)
export const initialPasesDeposito = [];

// Pagos a cuenta corriente
export const initialPagosCtaCte = [
  { id:1, clienteId:1, fecha:"2026-05-05", monto:7600,  observacion:"Pago parcial en efectivo" },
  { id:2, clienteId:2, fecha:"2026-05-10", monto:22500, observacion:"Pago con transferencia"   },
  { id:3, clienteId:5, fecha:"2026-05-20", monto:20000, observacion:"Pago parcial"             },
];

export const initialRecibos = [];
export const initialTesoreria = [];
export const initialAsientosManuales = [];

export const initialPlanCuentas = [
  // ── ACTIVO ──────────────────────────────────────────────────────────────────
  { id:"1",   codigo:"1",     nombre:"ACTIVO",                    tipo:"activo",     nivel:1, imputable:false },
  { id:"11",  codigo:"1.1",   nombre:"Activos Corrientes",        tipo:"activo",     nivel:2, imputable:false },
  { id:"111", codigo:"1.1.1", nombre:"Caja",                      tipo:"activo",     nivel:3, imputable:true  },
  { id:"112", codigo:"1.1.2", nombre:"Banco / Transferencias",    tipo:"activo",     nivel:3, imputable:true  },
  { id:"113", codigo:"1.1.3", nombre:"Tarjetas / Mercado Pago",   tipo:"activo",     nivel:3, imputable:true  },
  { id:"114", codigo:"1.1.4", nombre:"Clientes (Cta. Cte.)",      tipo:"activo",     nivel:3, imputable:true  },
  { id:"115", codigo:"1.1.5", nombre:"Mercaderías",               tipo:"activo",     nivel:3, imputable:true  },
  { id:"12",  codigo:"1.2",   nombre:"Activos No Corrientes",     tipo:"activo",     nivel:2, imputable:false },
  { id:"121", codigo:"1.2.1", nombre:"Bienes de Uso",             tipo:"activo",     nivel:3, imputable:true  },
  // ── PASIVO ──────────────────────────────────────────────────────────────────
  { id:"2",   codigo:"2",     nombre:"PASIVO",                    tipo:"pasivo",     nivel:1, imputable:false },
  { id:"21",  codigo:"2.1",   nombre:"Pasivo Corriente",          tipo:"pasivo",     nivel:2, imputable:false },
  { id:"211", codigo:"2.1.1", nombre:"Proveedores",               tipo:"pasivo",     nivel:3, imputable:true  },
  { id:"212", codigo:"2.1.2", nombre:"Deudas Fiscales",           tipo:"pasivo",     nivel:3, imputable:true  },
  // ── PATRIMONIO NETO ─────────────────────────────────────────────────────────
  { id:"3",   codigo:"3",     nombre:"PATRIMONIO NETO",           tipo:"patrimonio", nivel:1, imputable:false },
  { id:"31",  codigo:"3.1",   nombre:"Capital y Resultados",      tipo:"patrimonio", nivel:2, imputable:false },
  { id:"311", codigo:"3.1.1", nombre:"Capital Social",            tipo:"patrimonio", nivel:3, imputable:true  },
  { id:"312", codigo:"3.1.2", nombre:"Resultados Acumulados",     tipo:"patrimonio", nivel:3, imputable:true  },
  // ── INGRESOS ────────────────────────────────────────────────────────────────
  { id:"4",   codigo:"4",     nombre:"INGRESOS",                  tipo:"ingreso",    nivel:1, imputable:false },
  { id:"41",  codigo:"4.1",   nombre:"Ingresos por Ventas",       tipo:"ingreso",    nivel:2, imputable:false },
  { id:"411", codigo:"4.1.1", nombre:"Ventas",                    tipo:"ingreso",    nivel:3, imputable:true  },
  { id:"42",  codigo:"4.2",   nombre:"Otros Ingresos",            tipo:"ingreso",    nivel:2, imputable:false },
  { id:"421", codigo:"4.2.1", nombre:"Sobrante de Caja",          tipo:"ingreso",    nivel:3, imputable:true  },
  { id:"422", codigo:"4.2.2", nombre:"Otros Ingresos",            tipo:"ingreso",    nivel:3, imputable:true  },
  // ── EGRESOS ─────────────────────────────────────────────────────────────────
  { id:"5",   codigo:"5",     nombre:"EGRESOS",                   tipo:"egreso",     nivel:1, imputable:false },
  { id:"51",  codigo:"5.1",   nombre:"Costo de Ventas",           tipo:"egreso",     nivel:2, imputable:false },
  { id:"511", codigo:"5.1.1", nombre:"Costo de Mercaderías",      tipo:"egreso",     nivel:3, imputable:true  },
  { id:"52",  codigo:"5.2",   nombre:"Gastos de Administración",  tipo:"egreso",     nivel:2, imputable:false },
  { id:"521", codigo:"5.2.1", nombre:"Sueldos y Jornales",        tipo:"egreso",     nivel:3, imputable:true  },
  { id:"522", codigo:"5.2.2", nombre:"Alquiler",                  tipo:"egreso",     nivel:3, imputable:true  },
  { id:"523", codigo:"5.2.3", nombre:"Servicios Públicos",        tipo:"egreso",     nivel:3, imputable:true  },
  { id:"524", codigo:"5.2.4", nombre:"Gastos Bancarios",          tipo:"egreso",     nivel:3, imputable:true  },
  { id:"525", codigo:"5.2.5", nombre:"Gastos Generales",          tipo:"egreso",     nivel:3, imputable:true  },
  { id:"526", codigo:"5.2.6", nombre:"Publicidad y Marketing",    tipo:"egreso",     nivel:3, imputable:true  },
  { id:"527", codigo:"5.2.7", nombre:"Impuestos y Tasas",         tipo:"egreso",     nivel:3, imputable:true  },
  { id:"528", codigo:"5.2.8", nombre:"Faltante de Caja",          tipo:"egreso",     nivel:3, imputable:true  },
];

export const initialProveedores = [
  { id:1, nombre:"TextilSur S.R.L.", cuit:"30-55512345-9", tel:"381-444-0001", dir:"Av. Mate de Luna 890", iva:"Responsable Inscripto", email:"ventas@textilsur.com", proximoViaje:"2026-07-15", diasColchon:5 },
  { id:2, nombre:"CalzaSport",       cuit:"20-28901234-5", tel:"381-444-0002", dir:"Belgrano 1234",        iva:"Monotributista",       email:"info@calzasport.com",  proximoViaje:"2026-07-15", diasColchon:7 },
  { id:3, nombre:"AccesoriosMdZ",    cuit:"30-67890123-1", tel:"381-444-0003", dir:"San Martín 567",       iva:"Responsable Inscripto", email:"pedidos@accmza.com",  proximoViaje:"2026-07-15", diasColchon:5 },
];

export const initialCompras = [
  { id:1, tipo:"Factura", nro:"0001-00005343",   fecha:"2026-05-28", proveedor:"TextilSur S.R.L.", proveedorId:1, formaPago:"Transferencia",             total:84000,  estado:"recibida",          items:[{nombre:"Remera Oversize Negro M",qty:30,costo:2800}] },
  { id:2, tipo:"Remito",  nro:"R-0001-00000210", fecha:"2026-05-30", proveedor:"CalzaSport",       proveedorId:2, formaPago:"Cuenta Corriente Proveedor", total:144000, estado:"pendiente_factura", items:[{nombre:"Zapatilla Running 42",qty:12,costo:12000}] },
  { id:3, tipo:"Factura", nro:"0001-00005344",   fecha:"2026-06-01", proveedor:"TextilSur S.R.L.", proveedorId:1, formaPago:"Efectivo",                  total:19000,  estado:"recibida",          items:[{nombre:"Short Deportivo M",qty:10,costo:1900}] },
  { id:4, tipo:"Factura", nro:"0001-00005345",   fecha:"2026-06-05", proveedor:"TextilSur S.R.L.", proveedorId:1, formaPago:"Cuenta Corriente Proveedor", total:56000,  estado:"recibida",          items:[{nombre:"Short Deportivo M",qty:20,costo:1900},{nombre:"Remera Oversize Negro M",qty:5,costo:2800}] },
  { id:5, tipo:"Factura", nro:"0001-00000089",   fecha:"2026-06-08", proveedor:"AccesoriosMdZ",    proveedorId:3, formaPago:"Cuenta Corriente Proveedor", total:51500,  estado:"recibida",          items:[{nombre:"Mochila Urbana",qty:5,costo:5500},{nombre:"Medias Pack x3",qty:40,costo:600}] },
];

export const initialOrdenesPago = [];

export const initialGastos = [
  { id:1, nro:"G-0001", fecha:"2026-06-01", cuentaId:"522", concepto:"Alquiler local junio", monto:180000, formaPago:"Transferencia", proveedorId:null, proveedor:null, referencia:"", recurrente:true,  estado:"registrado" },
  { id:2, nro:"G-0002", fecha:"2026-06-03", cuentaId:"523", concepto:"Factura de luz EDET",  monto:32000,  formaPago:"Transferencia", proveedorId:null, proveedor:null, referencia:"Fact. 0012-334455", recurrente:true,  estado:"registrado" },
  { id:3, nro:"G-0003", fecha:"2026-06-05", cuentaId:"521", concepto:"Sueldo cajera - junio", monto:280000, formaPago:"Transferencia", proveedorId:null, proveedor:null, referencia:"", recurrente:true,  estado:"registrado" },
  { id:4, nro:"G-0004", fecha:"2026-06-10", cuentaId:"525", concepto:"Compra de insumos de librería", monto:8500, formaPago:"Efectivo", proveedorId:null, proveedor:null, referencia:"", recurrente:false, estado:"registrado" },
  { id:5, nro:"G-0005", fecha:"2026-06-12", cuentaId:"526", concepto:"Pauta publicitaria Instagram", monto:25000, formaPago:"Tarjeta Crédito", proveedorId:null, proveedor:null, referencia:"", recurrente:false, estado:"registrado" },
];
