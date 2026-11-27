import { NextResponse } from 'next/server'
import { buildClientAlerts } from '@/lib/admin/client-alerts'
import { isDbConfigured, sql, toClient, CLIENT_COLUMNS, type ClientRow } from '@/lib/admin/db'
import { resumenTexto } from '@/lib/admin/digest'
import { readMercadoPago } from '@/lib/admin/mercadopago'
import { isAutoDebit } from '@/lib/admin/payments'
import { CERRADOS } from '@/lib/admin/prospects'
import { sendToAll } from '@/lib/admin/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Resumen diario al celular (lo dispara el cron de Vercel a las 8 de Córdoba, ver vercel.json).
// Se manda como mucho una vez por día: llamarla de nuevo no hace nada, así que no expone datos ni sirve para molestar.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Sin base' }, { status: 503 })
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Cordoba' })
    const [devices] = await sql().query('select count(*)::int as n from push_subscriptions')
    if (!devices.n) return NextResponse.json({ skipped: 'sin dispositivos' })
    const claimed = await sql().query(
      "insert into app_settings (key, value) values ('resumen', $1) on conflict (key) do update set value = excluded.value, updated_at = now() where app_settings.value <> excluded.value returning key",
      [today],
    )
    if (!claimed.length) return NextResponse.json({ skipped: 'ya se mandó hoy' })

    const [[prospects], [tasks], clientRows] = await Promise.all([
      sql().query('select count(*)::int as n from prospects where proximo_fecha <= $1 and not (estado = any($2))', [today, CERRADOS]),
      sql().query('select count(*)::int as n from client_tasks where hecho_at is null and fecha <= $1', [today]),
      sql().query(`select ${CLIENT_COLUMNS} from clients`),
    ])
    const clients = (clientRows as ClientRow[]).map(toClient)
    const token = process.env.MP_ACCESS_TOKEN
    const mp = token ? await readMercadoPago(token).catch(() => null) : null
    const paid = mp?.ok ? mp : null
    const alerts = buildClientAlerts(clients, new Date(`${today}T12:00:00`), paid?.pagos ?? {}, (c) => !!paid && !!c.plan && isAutoDebit(c.metodoPago) && !paid.suscriptos.has(c.empresa))
    const texto = resumenTexto({
      seguimientos: prospects.n,
      pendientes: tasks.n,
      cobros: alerts.filter((a) => a.type === 'pago' && a.days <= 0).length,
      dominios: alerts.filter((a) => a.type === 'dominio' && a.days <= 7).length,
      suscripciones: alerts.filter((a) => a.type === 'suscripcion').length,
    })
    if (!texto) return NextResponse.json({ skipped: 'nada para hoy' })
    return NextResponse.json(await sendToAll({ title: 'Autogestiva · Hoy', body: texto, url: '/administracion/hoy' }))
  } catch (error) {
    console.error('[cron] resumen failed:', error)
    return NextResponse.json({ error: 'No se pudo armar el resumen' }, { status: 500 })
  }
}
