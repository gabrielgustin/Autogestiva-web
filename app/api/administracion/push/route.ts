import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { isDbConfigured, sql } from '@/lib/admin/db'
import { sendToAll, vapidKeys } from '@/lib/admin/push'

export const dynamic = 'force-dynamic'

async function handle(action: () => Promise<NextResponse>) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 503 })
  try {
    return await action()
  } catch (error) {
    console.error('[admin] push route failed:', error)
    return NextResponse.json({ error: 'No se pudieron configurar los avisos' }, { status: 500 })
  }
}

const readJson = (request: Request): Promise<Record<string, any>> => request.json().then((body) => (body && typeof body === 'object' ? body : {}), () => ({}))
const isUrl = (value: unknown): value is string => typeof value === 'string' && value.length < 1000 && /^https:\/\//.test(value)
const isKey = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,200}$/.test(value)

// Clave pública para que el navegador se suscriba.
export async function GET() {
  return handle(async () => NextResponse.json({ publicKey: (await vapidKeys()).publicKey }))
}

// Activa los avisos en este dispositivo ({ subscription }) o manda uno de prueba ({ test: true }).
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request)
    if (body.test) {
      const result = await sendToAll({ title: 'Autogestiva', body: 'Los avisos del panel funcionan en este dispositivo.', url: '/administracion/hoy' })
      return NextResponse.json(result)
    }
    const sub = body.subscription
    if (!isUrl(sub?.endpoint) || !isKey(sub?.keys?.p256dh) || !isKey(sub?.keys?.auth)) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    await sql().query('insert into push_subscriptions (endpoint, p256dh, auth) values ($1, $2, $3) on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth', [sub.endpoint, sub.keys.p256dh, sub.keys.auth])
    return NextResponse.json({ ok: true }, { status: 201 })
  })
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const { endpoint } = await readJson(request)
    if (!isUrl(endpoint)) return NextResponse.json({ error: 'Dispositivo inválido' }, { status: 400 })
    await sql().query('delete from push_subscriptions where endpoint = $1', [endpoint])
    return NextResponse.json({ ok: true })
  })
}
