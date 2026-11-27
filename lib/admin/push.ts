import webpush from 'web-push'
import { sql } from '@/lib/admin/db'

// Claves VAPID de las notificaciones: se generan solas la primera vez y quedan guardadas en la base
// (así no hay que cargar ninguna clave en Vercel).
export async function vapidKeys() {
  const read = async () => (await sql().query("select value from app_settings where key = 'vapid'"))[0]?.value as string | undefined
  let saved = await read()
  if (!saved) {
    const keys = webpush.generateVAPIDKeys()
    await sql().query("insert into app_settings (key, value) values ('vapid', $1) on conflict (key) do nothing", [JSON.stringify(keys)])
    saved = await read()
  }
  return JSON.parse(saved!) as { publicKey: string; privateKey: string }
}

export type PushPayload = { title: string; body: string; url: string }

// Manda la notificación a todos los dispositivos activados; borra los que ya no existen (desinstalados o permiso quitado).
export async function sendToAll(payload: PushPayload) {
  const keys = await vapidKeys()
  const subs = (await sql().query('select endpoint, p256dh, auth from push_subscriptions')) as { endpoint: string; p256dh: string; auth: string }[]
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: 'https://www.autogestiva.com.ar', publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 12 * 3600,
      })
      sent++
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await sql().query('delete from push_subscriptions where endpoint = $1', [sub.endpoint])
      else console.error('[admin] push failed:', status, error)
    }
  }
  return { sent, devices: subs.length }
}
