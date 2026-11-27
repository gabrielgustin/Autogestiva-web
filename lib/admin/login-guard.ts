import { sql } from '@/lib/admin/db'

// Freno a quien prueba contraseñas. Se guarda en la base (no en memoria) porque en Vercel cada pedido puede caer en otra instancia.
export const MAX_POR_IP = 5
// Más alto que por IP: si no, alguien podría dejar al dueño afuera fallando a propósito con su email.
export const MAX_POR_EMAIL = 20

export async function loginBlocked(ip: string, email: string) {
  const [r] = await sql().query(
    "select count(*) filter (where ip = $1)::int as ip, count(*) filter (where email = $2)::int as email from login_attempts where created_at > now() - interval '15 minutes'",
    [ip, email],
  )
  return r.ip >= MAX_POR_IP || r.email >= MAX_POR_EMAIL
}

export async function recordFailure(ip: string, email: string) {
  await sql().query('insert into login_attempts (ip, email) values ($1, $2)', [ip, email.slice(0, 200)])
  // Limpieza de lo viejo de vez en cuando, sin un cron aparte.
  if (Math.random() < 0.1) await sql().query("delete from login_attempts where created_at < now() - interval '1 day'")
}

export async function clearFailures(ip: string, email: string) {
  await sql().query('delete from login_attempts where ip = $1 or email = $2', [ip, email])
}
