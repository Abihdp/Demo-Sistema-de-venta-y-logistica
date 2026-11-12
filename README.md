# PECO S. — Versión demo

Copia del sistema de gestión pensada para que cualquiera pueda conocer las
funciones y probarlas **sin base de datos**. Todo se guarda en el
`localStorage` del navegador de cada visitante: nada sale de su equipo y cada
uno tiene su propia copia de los datos.

## Usuarios de prueba

| Usuario    | Contraseña | Rol           |
|------------|------------|---------------|
| `admin`    | `demo`     | Administrador (todos los permisos) |
| `vendedor` | `demo`     | Vendedor (ventas, productos, clientes, caja) |

En la pantalla de login se pueden tocar para autocompletar.

## Correr en local

```bash
npm install
npm run dev
```

## Publicar

```bash
npm run build
```

Genera la carpeta `dist/`, que es un sitio estático: se puede subir tal cual a
Netlify, Vercel, GitHub Pages o cualquier hosting. No hace falta `.env` ni
servidor.

## Cómo funciona

- `src/lib/supabase.js` reemplaza al cliente de Supabase por uno que imita su
  API (`from().select/insert/update/upsert/delete`, filtros, `order`, `rpc`,
  realtime) y guarda cada tabla en `localStorage` bajo `pecos_demo:<tabla>`.
  El resto de la app no se modificó.
- `src/lib/demoSeed.js` tiene los datos de ejemplo (productos, stock,
  clientes, proveedores, plan de cuentas, ~60 días de ventas). Si se cambian,
  subir `DEMO_VERSION` para que los navegadores que ya abrieron la demo
  recarguen los datos.
- El botón **Restablecer demo** (barra superior) borra todos los cambios y
  vuelve a los datos de ejemplo.
- Con varias pestañas abiertas, los cambios se sincronizan entre ellas
  (igual que entre PCs en la versión real).

## Limitaciones

- La impresión directa por ticketera usa el agente local (`localhost:9100`),
  que no está incluido en la demo.
- El `localStorage` tiene un límite de ~5 MB por sitio; cargar un logo muy
  pesado o miles de registros puede llenarlo (la app avisa y se puede
  restablecer).
