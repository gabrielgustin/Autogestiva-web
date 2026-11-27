import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { isDbConfigured, sql } from '@/lib/admin/db'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const COLUMNS = 'id, client_id as "clientId", texto, fecha::text'

// Pendientes de cada cliente: se listan los que faltan; «Hecho» los marca, no los borra.
async function handle(action: () => Promise<NextResponse>) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 503 })
  try {
    return await action()
  } catch (error) {
    console.error('[admin] client tasks failed:', error)
    return NextResponse.json({ error: 'No se pudo acceder a los pendientes' }, { status: 500 })
  }
}

const readJson = (request: Request): Promise<Record<string, unknown>> => request.json().then((body) => (body && typeof body === 'object' ? body : {}), () => ({}))

export async function GET() {
  return handle(async () => NextResponse.json(await sql().query(`select ${COLUMNS} from client_tasks where hecho_at is null order by fecha, created_at`)))
}

export async function POST(request: Request) {
  return handle(async () => {
    const { clientId, texto, fecha } = await readJson(request)
    const text = typeof texto === 'string' ? texto.trim().slice(0, 300) : ''
    if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
    if (!text || typeof fecha !== 'string' || !DATE_RE.test(fecha)) return NextResponse.json({ error: 'Completá qué hay que hacer y la fecha' }, { status: 400 })
    const [task] = await sql().query(`insert into client_tasks (client_id, texto, fecha) values ($1, $2, $3) returning ${COLUMNS}`, [clientId, text, fecha])
    return NextResponse.json(task, { status: 201 })
  })
}

export async function PUT(request: Request) {
  return handle(async () => {
    const { id } = await readJson(request)
    if (typeof id !== 'string' || !UUID_RE.test(id)) return NextResponse.json({ error: 'Pendiente inválido' }, { status: 400 })
    await sql().query('update client_tasks set hecho_at = now() where id = $1 and hecho_at is null', [id])
    return NextResponse.json({ ok: true })
  })
}
