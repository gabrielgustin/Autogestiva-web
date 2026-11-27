# Autogestiva · web y panel de trabajo

Este repositorio tiene dos cosas que se publican juntas en **https://www.autogestiva.com.ar**:

1. **La web pública de Autogestiva**: portada, páginas de servicios y casos de clientes.
2. **El panel privado `/administracion`**: la plataforma de trabajo diaria. Reúne agenda, clientes y cobros, prospectos de venta y el costo de la infraestructura.

> El repositorio es **público**. No subir claves, conexiones a la base, datos de clientes ni capturas con información privada. Todo eso vive en Vercel o en la base de datos.

---

## Puesta en marcha

| | |
| --- | --- |
| Framework | Next.js 16 (App Router) + React + TypeScript |
| Estilos | Tailwind, con tokens de marca (`ink`, `paper`, `brand`, `line`…) |
| Base de datos | Postgres en Neon (`@neondatabase/serverless`) |
| Hosting | Vercel: cada push a `main` se publica solo |
| Paquetes | pnpm 9 (`npx -y pnpm@9 install` si no está instalado) |

```bash
npx -y pnpm@9 install
npm run dev -- -p 3210
```

- Abrir http://localhost:3210 (web) y http://localhost:3210/administracion (panel).
- `.env.local` (no está en git) apunta a la **rama de pruebas** de la base, nunca a producción:
  - `DATABASE_URL`: conexión a la rama de pruebas.
  - `ADMIN_DEV_BYPASS=1` y `NEXT_PUBLIC_ADMIN_DEV_BYPASS=1`: en local se entra al panel sin login (solo con `NODE_ENV=development`).
- En local no hay claves de Neon ni de Mercado Pago. Infraestructura, la rentabilidad y la conciliación de cobros solo muestran datos reales en producción; en local avisan «No se pudo leer».

### Publicar

1. Probar en local, correr los autocontroles (más abajo) y `npm run build`.
2. Si el cambio toca la base, primero aplicar `db/schema.sql` en la rama de producción. Es idempotente (`if not exists`): se puede correr entero sin borrar nada.
3. `git push` a `main`. Vercel despliega solo; el estado se ve con `gh api repos/<dueño>/<repo>/commits/<sha>/status`.

La conexión de producción se obtiene en Vercel → Storage → la base de Neon → «Open in Neon». Se usa solo como variable de entorno de un comando, **nunca se guarda en archivos**.

---

## Estructura

```
app/
  page.tsx, [slug]/            Web pública (portada y páginas de servicios)
  administracion/              Panel privado: hoy/, clientes/, prospectos/, proyectos/[id], login/
  api/administracion/*         APIs del panel (todas piden sesión de admin)
  api/cron/resumen             Resumen diario al celular (lo llama el cron de Vercel)
components/
  home/                        Secciones de la web pública
  admin/                       Pantallas y piezas del panel
  ui/                          Componentes base (shadcn)
lib/
  site-data.ts, services.ts    Contenido de la web pública (clientes, proyectos, servicios)
  admin/                       Lógica del panel (sesión, base, Neon, Mercado Pago, prospectos, cobros…)
  admin/__checks__/            Autocontroles
db/
  schema.sql                   Esquema completo de la base (idempotente)
  importar-prospectos.mjs      Importa tandas de prospectos desde un JSON
public/
  admin-sw.js, administracion.webmanifest, icon-192.png   App instalable y avisos del panel
vercel.json                    Cron del resumen diario (11:00 UTC = 8:00 de Córdoba)
```

---

## Web pública

- **Contenido**: `lib/site-data.ts` (contacto, clientes, proyectos, pasos del proceso) y `lib/services.ts` (páginas de servicio con su `slug`, título y descripción para buscadores).
- **Secciones**: en `components/home/`. La portada se arma en `app/page.tsx`.
- **SEO**: `app/sitemap.ts`, `app/robots.ts` y metadatos por página. El panel no se indexa.

---

## Panel `/administracion`

Menú: **Hoy · Clientes · Infraestructura · Prospectos**. Al iniciar sesión se entra a «Hoy».

### Hoy (`components/admin/today-dashboard.tsx`)
- Una sola agenda con todo lo que toca hoy o está atrasado, más los próximos 7 días:
  - seguimientos de prospectos;
  - pendientes de clientes;
  - cobros vencidos, dominios por vencer y links de suscripción por mandar;
  - alertas de Neon.
- Cada ítem abre su ficha (`?abrir=<id>` en Prospectos y Clientes). «Hecho» lo saca de la agenda.
- Botón **«Avisarme cada mañana»**: activa en ese dispositivo el resumen diario por notificación push. En iPhone, antes hay que agregar el panel a la pantalla de inicio desde Safari.

### Clientes (`components/admin/clients-dashboard.tsx`)
- Ficha por servicio. Los servicios de la misma empresa o persona se agrupan.
- **Cobros**:
  - el próximo pago se calcula con el método de pago (`lib/admin/payments.ts`);
  - Mercado Pago confirma los débitos automáticos (`lib/admin/mercadopago.ts`). El vínculo pagador → empresa está a mano en `lib/admin/mercadopago-links.ts`.
- **Para atender**: cobros, dominios y avisos de suscripción (`lib/admin/client-alerts.ts`).
- **Pendientes**: cosas por hacer con fecha, que aparecen en «Hoy» (tabla `client_tasks`).
- **Orden**: las filas se ordenan arrastrando desde la manija de puntitos, o con las flechas del teclado sobre ella (`use-drag-sort.ts`).
- **Valor de venta**: precio al que se vendió el servicio, editable en el detalle.
- **Rentabilidad mensual**: plan menos el costo proyectado de su base en Neon, pasado a pesos al dólar tarjeta (dolarapi.com). Cada servicio indica su «Base en Neon» en «Editar».
- **Historial comercial**: si el cliente vino de Prospectos, su detalle muestra lo que se habló cuando era prospecto. Se vincula por nombre: empresa igual a negocio.

### Prospectos (`components/admin/prospects-dashboard.tsx`)
- **Embudo**: Por contactar → Hacer demo → Demo lista → Contactado → Interesado → Cliente, además de Rechazado y En pausa.
  - El arrastre es propio, con eventos de puntero.
  - Los títulos de columna quedan fijos arriba.
- **Ficha**:
  - datos del negocio;
  - botón de WhatsApp. En el primer contacto con demo lleva el mensaje de `primerMensaje` en `lib/admin/prospects.ts`, que no se cambia sin pedido;
  - registro de contactos e historial.
- **«Próximo paso» y fecha** arrancan vacíos: los completa uno. Lo ya agendado se ve en un recuadro aparte.
- **Pasar a «Cliente»**: ofrece darlo de alta en Clientes con el formulario compartido (`client-form.tsx`, `add-client.tsx`).
- En «Por contactar» de Carta digital solo van negocios con carta en PDF verificada.

### Infraestructura (`components/admin/infrastructure-dashboard.tsx`, `app/api/administracion/neon`)
- Costo y consumo de todas las bases de Neon por mes, con las tarifas del plan Launch.
- La proyección usa el ritmo de los últimos 7 días (`lib/admin/neon-projection.ts`).
- Avisa picos de gasto y bases que estuvieron despiertas 12 h o más el día anterior.
- Permite despertar o suspender una base y ver sus tablas.
- En producción el token de Neon llega por Vercel Connect; en local haría falta `NEON_API_KEY`.

### Sesión
- El login compara contra `admin_users` (contraseña con hash bcrypt).
- La sesión se cierra al cerrar la pestaña (`session-guard.tsx`). Por eso cada pestaña nueva, o la app instalada, pide entrar de nuevo.

---

## Base de datos (`db/schema.sql`)

| Tabla | Para qué |
| --- | --- |
| `clients` | Servicios de cada cliente: contacto, dominio, plan, cobro, valor de venta, base en Neon y orden |
| `client_tasks` | Pendientes por cliente (`hecho_at` marca los terminados) |
| `prospects` / `prospect_events` | Prospectos de venta y su historial |
| `admin_users` | Quién puede entrar al panel |
| `push_subscriptions` | Dispositivos con los avisos activados |
| `app_settings` | Ajustes internos: claves de las notificaciones y fecha del último resumen diario |

Hay dos ramas de Neon: **producción** (`main`, la usa Vercel) y **pruebas** (la de `.env.local`). Cualquier prueba que escriba datos va contra la de pruebas.

---

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Base de Neon. La carga sola la integración de Neon en Vercel |
| `MP_ACCESS_TOKEN` | Lectura de suscripciones y cobros de Mercado Pago |
| `NEON_API_KEY` | Opcional: en producción se usa Vercel Connect; sirve para ver Infraestructura en local |
| `BETTER_AUTH_SECRET` | Opcional: secreto de sesión (si falta, se deriva de `DATABASE_URL`) |
| `CRON_SECRET` | Opcional: si existe, el resumen diario solo acepta al cron de Vercel. Sin ella igual se manda una sola vez por día |
| `ADMIN_DEV_BYPASS`, `NEXT_PUBLIC_ADMIN_DEV_BYPASS` | Solo en local, para entrar sin login |

Las claves de las notificaciones push (VAPID) no van en Vercel: se generan solas y quedan en `app_settings`.

---

## Autocontroles

Pruebas chicas con `assert` para la lógica que no se ve a simple vista:

```bash
for f in lib/admin/__checks__/*.ts; do npx -y tsx "$f"; done
npx tsc --noEmit -p .
npm run build
```

Cubren pagos y alertas, prospectos (teléfonos, WhatsApp, mensaje, datos para el alta), orden por arrastre, rentabilidad, proyección de Neon y texto del resumen diario.

---

## Convenciones

- **Textos**: todo en español rioplatense.
  - Los comentarios del código explican el *por qué*.
  - Los atajos conocidos llevan `shortcut: <límite>, <cuándo mejorarlo>`.
- **Componentes del panel**: `components/admin/ui.tsx` (botones, tarjetas, modal, confirmación) y `components/admin/pickers.tsx` (desplegables y calendarios propios). No usar los nativos del navegador.
- **Costo de Neon**: cada consulta a la base la despierta y se paga por hora despierta. Evitar sondeos frecuentes y preferir una sola consulta por pantalla.
- **Documentos viejos**: `SUPABASE_SETUP.md`, `SETUP_INSTRUCTIONS.md`, `INSTRUCCIONES_*.md` y `CONFIGURAR_DATABASE_URL.md` son históricos, de antes de migrar de Supabase a Neon (noviembre de 2026). La referencia vigente es este README.
- **Script roto**: `npm run test:mp` apunta a `scripts/test-mercadopago.js`, que ya no existe.
