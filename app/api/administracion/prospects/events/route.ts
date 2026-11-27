import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { isDbConfigured, sql } from '@/lib/admin/db'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 503 })
  return null
}

// Historial de un prospecto, del más nuevo al más viejo.
// Con ?negocio=<nombre> (desde la ficha de un cliente) busca el prospecto por nombre y devuelve { prospectId, events }.
export async function GET(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const negocio = params.get('negocio')?.trim().slice(0, 300)
  if (negocio) {
    try {
      const [prospect] = await sql().query('select id::text from prospects where lower(negocio) = lower($1)', [negocio])
      if (!prospect) return NextResponse.json({ prospectId: null, events: [] })
      return NextResponse.json({ prospectId: prospect.id, events: await eventsOf(prospect.id) })
    } catch (error) {
      console.error('[admin] prospect events by name failed:', error)
      return NextResponse.json({ error: 'No se pudo cargar el historial' }, { status: 500 })
    }
  }
  const id = params.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Prospecto inválido' }, { status: 400 })
  try {
    return NextResponse.json(await eventsOf(id))
  } catch (error) {
    console.error('[admin] prospect events GET failed:', error)
    return NextResponse.json({ error: 'No se pudo cargar el historial' }, { status: 500 })
  }
}

function eventsOf(id: string) {
  return sql().query(
    `select id::text, tipo, coalesce(texto, '') as texto, to_char(created_at at time zone 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI') as fecha
     from prospect_events where prospect_id = $1 order by created_at desc, id desc limit 200`,
    [id],
  )
}
