// Datos de ejemplo de la DEMO. Se cargan en localStorage la primera vez que
// se abre la app (o al tocar "Restablecer demo").
//
// Las filas están en el formato de la base (snake_case), igual que las
// devolvería Supabase. Si se cambia algo acá, subir DEMO_VERSION para que
// los navegadores que ya abrieron la demo recarguen los datos.

import { PERMISOS_LABELS } from '../constants/index.js'

export const DEMO_VERSION = 1

// Credenciales que se muestran en la pantalla de login.
export const DEMO_USUARIOS = [
  { nombre: 'admin',    password: 'demo', rol: 'Administrador' },
  { nombre: 'vendedor', password: 'demo', rol: 'Vendedor' },
]

// SHA-256 de "demo" (useAuth compara contra el hash).
const HASH_DEMO = '2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea'

function fechaLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function haceDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

// Generador pseudoaleatorio con semilla: la demo arranca igual para todos.
function rng(semilla) {
  let s = semilla
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function seedDemo() {
  const ahora = new Date().toISOString()
  const todosLosPermisos = Object.fromEntries(Object.keys(PERMISOS_LABELS).map(k => [k, true]))
  const permisosVendedor = Object.fromEntries(
    Object.keys(PERMISOS_LABELS).map(k => [k, ['verVentas', 'verProductos', 'verEtiquetas', 'verClientes', 'verCaja'].includes(k)])
  )

  const usuarios = [
    { id: 1, nombre: 'admin',    email: 'admin@demo.local',    rol: 'admin',    color: '#7c6fef', permisos: todosLosPermisos, activo: true, contrasena: HASH_DEMO, pin: '0000', created_at: ahora },
    { id: 2, nombre: 'vendedor', email: 'vendedor@demo.local', rol: 'vendedor', color: '#3ecf8e', permisos: permisosVendedor, activo: true, contrasena: HASH_DEMO, pin: '1111', created_at: ahora },
  ]

  // ── Rubros / subrubros ──
  const estructura = {
    INDUMENTARIA: ['REMERAS', 'PANTALONES', 'BUZOS', 'CAMPERAS', 'SHORTS'],
    CALZADO:      ['ZAPATILLAS', 'SANDALIAS', 'BOTAS'],
    ACCESORIOS:   ['MOCHILAS', 'GORRAS', 'MEDIAS', 'CINTURONES'],
  }
  const rubros = []
  const subrubros = []
  Object.entries(estructura).forEach(([nombre, subs], i) => {
    const rubroId = i + 1
    rubros.push({ id: rubroId, nombre, activo: true, orden: i, margen: null, created_at: ahora })
    subs.forEach((s, j) => subrubros.push({ id: subrubros.length + 1, rubro_id: rubroId, nombre: s, activo: true, orden: j, created_at: ahora }))
  })

  // ── Proveedores ──
  const proveedores = [
    { id: 1, nombre: 'Textil del Norte S.A.',  cuit: '30-71234567-8', tel: '381-400-1000', dir: 'Av. Industria 1200', email: 'ventas@textilnorte.demo', iva: 'Responsable Inscripto', dias_colchon: 5, activo: true, margen: null, created_at: ahora },
    { id: 2, nombre: 'Calzados Andinos SRL',   cuit: '30-70987654-3', tel: '381-400-2000', dir: 'Ruta 9 km 1300',     email: 'pedidos@andinos.demo',    iva: 'Responsable Inscripto', dias_colchon: 7, activo: true, margen: null, created_at: ahora },
    { id: 3, nombre: 'Accesorios Urbanos',     cuit: '20-28765432-1', tel: '381-400-3000', dir: 'Laprida 455',        email: 'hola@urbanos.demo',       iva: 'Monotributista',        dias_colchon: 5, activo: true, margen: null, created_at: ahora },
  ]

  // ── Productos ──
  const catalogo = [
    // [codigo, nombre, rubro, subrubro, color, talle, costo, precio, proveedor]
    ['RO-NEG-S', 'Remera Oversize Negro S',     'INDUMENTARIA', 'REMERAS',    'Negro',  'S',  2800,  5500,  1],
    ['RO-NEG-M', 'Remera Oversize Negro M',     'INDUMENTARIA', 'REMERAS',    'Negro',  'M',  2800,  5500,  1],
    ['RO-NEG-L', 'Remera Oversize Negro L',     'INDUMENTARIA', 'REMERAS',    'Negro',  'L',  2800,  5500,  1],
    ['RO-BLA-M', 'Remera Oversize Blanco M',    'INDUMENTARIA', 'REMERAS',    'Blanco', 'M',  2800,  5500,  1],
    ['JN-AZ-40', 'Jean Recto Azul 40',          'INDUMENTARIA', 'PANTALONES', 'Azul',   '40', 9500,  18900, 1],
    ['JN-AZ-42', 'Jean Recto Azul 42',          'INDUMENTARIA', 'PANTALONES', 'Azul',   '42', 9500,  18900, 1],
    ['BZ-GR-M',  'Buzo Canguro Gris M',         'INDUMENTARIA', 'BUZOS',      'Gris',   'M',  7800,  15500, 1],
    ['BZ-GR-L',  'Buzo Canguro Gris L',         'INDUMENTARIA', 'BUZOS',      'Gris',   'L',  7800,  15500, 1],
    ['CP-NEG-M', 'Campera Rompeviento Negra M', 'INDUMENTARIA', 'CAMPERAS',   'Negro',  'M',  14000, 27900, 1],
    ['SD-AZ-M',  'Short Deportivo Azul M',      'INDUMENTARIA', 'SHORTS',     'Azul',   'M',  1900,  3800,  1],
    ['ZR-BLA-41','Zapatilla Running Blanca 41', 'CALZADO',      'ZAPATILLAS', 'Blanco', '41', 12000, 22500, 2],
    ['ZR-BLA-42','Zapatilla Running Blanca 42', 'CALZADO',      'ZAPATILLAS', 'Blanco', '42', 12000, 22500, 2],
    ['ZU-NEG-40','Zapatilla Urbana Negra 40',   'CALZADO',      'ZAPATILLAS', 'Negro',  '40', 10500, 19900, 2],
    ['SN-MR-39', 'Sandalia Cuero Marrón 39',    'CALZADO',      'SANDALIAS',  'Marrón', '39', 6500,  12900, 2],
    ['BT-NEG-38','Bota Caña Corta Negra 38',    'CALZADO',      'BOTAS',      'Negro',  '38', 16000, 31500, 2],
    ['MU-NEG',   'Mochila Urbana Negra',        'ACCESORIOS',   'MOCHILAS',   'Negro',  '',   5500,  11000, 3],
    ['GR-BEI',   'Gorra Trucker Beige',         'ACCESORIOS',   'GORRAS',     'Beige',  '',   1800,  4200,  3],
    ['MP-BLA-3', 'Medias Pack x3 Blancas',      'ACCESORIOS',   'MEDIAS',     'Blanco', '',   600,   1500,  3],
    ['CI-MR-95', 'Cinturón Cuero Marrón 95',    'ACCESORIOS',   'CINTURONES', 'Marrón', '95', 3200,  6900,  3],
  ]
  const azar = rng(42)
  const productos = catalogo.map(([codigo, nombre, rubro, subrubro, color, talle, costo, precio, prov], i) => ({
    id: i + 1, tipo: 'simple', producto_madre_id: null, codigo_base: codigo, codigo, nombre,
    rubro, subrubro, color, talle, version: '', costo, precio, precio_base: null, margen: null,
    stock: 0, stock_minimo: 3, proveedor_id: prov, activo: true, precios_por_lista: {},
    created_at: ahora, updated_at: ahora,
  }))

  // ── Depósitos y stock ──
  const depositos = [
    { id: 1, nombre: 'Depósito Principal', tipo: 'normal',   activo: true, created_at: ahora },
    { id: 2, nombre: 'Salón de Ventas',    tipo: 'normal',   activo: true, created_at: ahora },
    { id: 3, nombre: 'Reservas',           tipo: 'reserva',  activo: true, created_at: ahora },
  ]
  const stock_depositos = []
  productos.forEach(p => {
    const principal = Math.floor(azar() * 20)
    const salon = Math.floor(azar() * 8)
    // Un par de productos sin stock / con stock bajo para mostrar alertas.
    const [c1, c2] = p.id === 12 ? [0, 0] : p.id === 15 ? [1, 0] : [principal, salon]
    stock_depositos.push({ id: stock_depositos.length + 1, producto_id: p.id, deposito_id: 1, cantidad: c1, updated_at: ahora, created_at: ahora })
    stock_depositos.push({ id: stock_depositos.length + 1, producto_id: p.id, deposito_id: 2, cantidad: c2, updated_at: ahora, created_at: ahora })
    stock_depositos.push({ id: stock_depositos.length + 1, producto_id: p.id, deposito_id: 3, cantidad: 0,  updated_at: ahora, created_at: ahora })
    p.stock = c1 + c2
  })

  // ── Clientes ──
  const clientes = [
    { id: 1, nombre: 'Juan Pérez',    dni: '28345678', tel: '381-555-0001', dir: 'Av. Aconquija 1234', email: '', iva: 'Consumidor Final',      config_mora: { usarGlobal: true }, limite_ctacte: 150000, activo: true, created_at: ahora },
    { id: 2, nombre: 'María García',  dni: '31222111', tel: '381-555-0002', dir: 'San Martín 456',     email: '', iva: 'Responsable Inscripto', config_mora: { usarGlobal: true }, limite_ctacte: 300000, activo: true, created_at: ahora },
    { id: 3, nombre: 'Carlos López',  dni: '25888999', tel: '381-555-0003', dir: 'Belgrano 789',       email: '', iva: 'Monotributista',        config_mora: { usarGlobal: true }, limite_ctacte: null,   activo: true, created_at: ahora },
    { id: 4, nombre: 'Laura Méndez',  dni: '33100200', tel: '381-555-0004', dir: 'Independencia 321',  email: '', iva: 'Consumidor Final',      config_mora: { usarGlobal: true }, limite_ctacte: 100000, activo: true, created_at: ahora },
    { id: 5, nombre: 'Roberto Soria', dni: '22987654', tel: '381-555-0005', dir: 'Corrientes 890',     email: '', iva: 'Responsable Inscripto', config_mora: { usarGlobal: true }, limite_ctacte: null,   activo: true, created_at: ahora },
  ]

  // ── Listas de precios y configuración ──
  const listas_precios = [
    { id: 1, nombre: 'Lista Minorista', pct: 0,  activa: true, formas_pago: ['Efectivo', 'Transferencia', 'Tarjeta Débito', 'Mercado Pago', 'Cuenta Corriente'], created_at: ahora },
    { id: 2, nombre: 'Lista Tarjeta',   pct: 15, activa: true, formas_pago: ['Tarjeta Crédito'], created_at: ahora },
    { id: 3, nombre: 'Lista Mayorista', pct: -10, activa: true, formas_pago: [], created_at: ahora },
  ]
  const config_precios = [
    { id: 1, margen_base: 100, permitir_stock_negativo: false, dias_aviso_actualizar_precios: 15, logo_base64: null, permitir_editar_precio_venta: true, config_mora: null, updated_at: ahora },
  ]

  // ── Tarjetas ──
  const tarjetas = [
    { id: 1, nombre: 'Visa',       banco: 'Banco Demo', activa: true, orden: 0, created_at: ahora },
    { id: 2, nombre: 'Mastercard', banco: 'Banco Demo', activa: true, orden: 1, created_at: ahora },
  ]
  const tarjeta_cuotas = [
    { id: 1, tarjeta_id: 1, cuotas: 1, interes_pct: 0,  orden: 0, created_at: ahora },
    { id: 2, tarjeta_id: 1, cuotas: 3, interes_pct: 12, orden: 1, created_at: ahora },
    { id: 3, tarjeta_id: 1, cuotas: 6, interes_pct: 25, orden: 2, created_at: ahora },
    { id: 4, tarjeta_id: 2, cuotas: 1, interes_pct: 0,  orden: 0, created_at: ahora },
    { id: 5, tarjeta_id: 2, cuotas: 3, interes_pct: 12, orden: 1, created_at: ahora },
  ]

  // ── Plan de cuentas (ids usados por Tesorería: 111, 112, 113, ...) ──
  const cuenta = (id, codigo, nombre, tipo, nivel, imputable) => ({ id, codigo, nombre, tipo, nivel, imputable, created_at: ahora })
  const plan_cuentas = [
    cuenta('1',   '1',     'Activo',                 'activo',     1, false),
    cuenta('11',  '1.1',   'Activo Corriente',       'activo',     2, false),
    cuenta('111', '1.1.1', 'Caja',                   'activo',     3, true),
    cuenta('112', '1.1.2', 'Cuenta Transferencia',   'activo',     3, true),
    cuenta('113', '1.1.3', 'Banco',                  'activo',     3, true),
    cuenta('114', '1.1.4', 'Deudores por Ventas',    'activo',     3, true),
    cuenta('115', '1.1.5', 'Mercaderías',            'activo',     3, true),
    cuenta('116', '1.1.6', 'Valores a Depositar',    'activo',     3, true),
    cuenta('2',   '2',     'Pasivo',                 'pasivo',     1, false),
    cuenta('21',  '2.1',   'Pasivo Corriente',       'pasivo',     2, false),
    cuenta('211', '2.1.1', 'Proveedores',            'pasivo',     3, true),
    cuenta('3',   '3',     'Patrimonio Neto',        'patrimonio', 1, false),
    cuenta('31',  '3.1',   'Capital',                'patrimonio', 2, false),
    cuenta('311', '3.1.1', 'Capital Social',         'patrimonio', 3, true),
    cuenta('4',   '4',     'Ingresos',               'ingreso',    1, false),
    cuenta('41',  '4.1',   'Ventas',                 'ingreso',    2, false),
    cuenta('411', '4.1.1', 'Ventas de Mercaderías',  'ingreso',    3, true),
    cuenta('5',   '5',     'Egresos',                'egreso',     1, false),
    cuenta('51',  '5.1',   'Costo de Ventas',        'egreso',     2, false),
    cuenta('511', '5.1.1', 'Costo de Mercaderías',   'egreso',     3, true),
    cuenta('52',  '5.2',   'Gastos Operativos',      'egreso',     2, false),
    cuenta('521', '5.2.1', 'Alquiler',               'egreso',     3, true),
    cuenta('522', '5.2.2', 'Servicios',              'egreso',     3, true),
    cuenta('523', '5.2.3', 'Sueldos',                'egreso',     3, true),
    cuenta('528', '5.2.8', 'Gastos Varios',          'egreso',     3, true),
  ]

  // ── Ventas de los últimos 60 días ──
  const ventas = []
  const venta_items = []
  const formas = ['Efectivo', 'Efectivo', 'Efectivo', 'Transferencia', 'Tarjeta Débito', 'Mercado Pago', 'Tarjeta Crédito']
  for (let dia = 60; dia >= 1; dia--) {
    const fecha = fechaLocal(haceDias(dia))
    const cantVentas = 1 + Math.floor(azar() * 4)
    for (let k = 0; k < cantVentas; k++) {
      const id = ventas.length + 1
      const esCtaCte = azar() < 0.12
      const cliente = esCtaCte || azar() < 0.3 ? clientes[Math.floor(azar() * clientes.length)] : null
      const formaPago = esCtaCte && cliente ? 'Cuenta Corriente' : formas[Math.floor(azar() * formas.length)]
      const lista = formaPago === 'Tarjeta Crédito' ? 'Lista Tarjeta' : 'Lista Minorista'
      const recargo = formaPago === 'Tarjeta Crédito' ? 1.15 : 1
      const cantItems = 1 + Math.floor(azar() * 3)
      let total = 0
      for (let j = 0; j < cantItems; j++) {
        const p = productos[Math.floor(azar() * productos.length)]
        const qty = 1 + Math.floor(azar() * 2)
        const precio = Math.round(p.precio * recargo)
        total += precio * qty
        venta_items.push({ id: venta_items.length + 1, venta_id: id, producto_id: p.id, nombre: p.nombre, qty, precio, created_at: ahora })
      }
      const hora = `${String(10 + Math.floor(azar() * 9)).padStart(2, '0')}:${String(Math.floor(azar() * 60)).padStart(2, '0')}:00`
      ventas.push({
        id, fecha, periodo: fecha.slice(0, 7),
        cliente_id: cliente?.id ?? null, cliente: cliente?.nombre || 'Consumidor Final',
        lista, forma_pago: formaPago, pagos: [{ formaPago, monto: total }],
        tipo: 'Mostrador', descripcion: '', tipo_factura: null, nro_comprobante: null,
        alicuota_iva: 0, neto: total, iva: 0, total,
        deposito_id: 2, deposito_nombre: 'Salón de Ventas',
        usuario: 'admin', estado: 'activa', es_sena: false, fecha_completada: null,
        retiros: [], created_at: new Date(`${fecha}T${hora}`).toISOString(),
      })
    }
  }

  // ── Estado de caja (tabla de una sola fila) ──
  const caja_turno = [{ id: 1, estado: {}, updated_at: ahora, created_at: ahora }]

  return {
    usuarios, rubros, subrubros, proveedores, productos, depositos, stock_depositos,
    clientes, listas_precios, config_precios, tarjetas, tarjeta_cuotas, plan_cuentas,
    ventas, venta_items, caja_turno,
  }
}
