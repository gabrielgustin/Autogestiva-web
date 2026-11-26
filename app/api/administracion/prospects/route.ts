import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { isDbConfigured, sql } from '@/lib/admin/db'
import { FIELDS, toDbRow, type Prospect } from '@/lib/admin/prospects'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = 'id, negocio, producto, rubro, contacto, whatsapp, email, instagram, web, demo, ciudad, motivo, estado, seguimiento, fecha_contacto::text, proximo_paso, proximo_fecha::text, notas, origen, created_at::date::text as creado'

async function guard() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 503 })
  return null
}

function toProspect(row: Record<string, any>): Prospect {
  const fields = Object.fromEntries(Object.entries(FIELDS).map(([key, column]) => [key, row[column] ?? '']))
  return { ...fields, id: row.id, origen: row.origen ?? '', creado: row.creado ?? '' } as Prospect
}

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

const isDuplicate = (error: unknown) => (error as { code?: string })?.code === '23505'
const duplicate = () => NextResponse.json({ error: 'Ya hay un prospecto con ese nombre' }, { status: 409 })

async function logEvent(id: string, tipo: unknown, texto: unknown) {
  if (typeof tipo !== 'string' || !tipo.trim()) return
  await sql().query('insert into prospect_events (prospect_id, tipo, texto) values ($1, $2, $3)', [id, tipo.trim().slice(0, 40), typeof texto === 'string' ? texto.trim().slice(0, 1000) || null : null])
}

export async function GET() {
  const denied = await guard()
  if (denied) return denied
  try {
    const rows = await sql().query(`select ${COLUMNS} from prospects order by updated_at desc`)
    return NextResponse.json(rows.map(toProspect))
  } catch (error) {
    console.error('[admin] prospects GET failed:', error)
    return NextResponse.json({ error: 'No se pudieron cargar los prospectos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const body = await readJson(request)
  const parsed = toDbRow({ ...body, negocio: body.negocio ?? '' })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  // Columnas fijas de FIELDS (nunca del pedido); los valores van como parámetros.
  const columns = Object.keys(parsed.row)
  try {
    const [row] = await sql().query(
      `insert into prospects (${columns.join(', ')}, origen) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}, 'Panel') returning ${COLUMNS}`,
      Object.values(parsed.row),
    )
    await logEvent(row.id, 'Alta', 'Cargado desde el panel')
    return NextResponse.json(toProspect(row), { status: 201 })
  } catch (error) {
    if (isDuplicate(error)) return duplicate()
    console.error('[admin] prospects POST failed:', error)
    return NextResponse.json({ error: 'No se pudo crear el prospecto' }, { status: 500 })
  }
}

// Actualiza solo los campos enviados. Con `evento: { tipo, texto }` además deja una entrada en el historial.
export async function PUT(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const { id, evento, ...fields } = await readJson(request)
  if (typeof id !== 'string' || !UUID_RE.test(id)) return NextResponse.json({ error: 'Prospecto inválido' }, { status: 400 })
  const parsed = toDbRow(fields)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const columns = Object.keys(parsed.row)
  try {
    const [before] = await sql().query('select estado from prospects where id = $1', [id])
    if (!before) return NextResponse.json({ error: 'El prospecto ya no existe. Actualizá la página.' }, { status: 404 })
    const [row] = columns.length
      ? await sql().query(`update prospects set ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1 returning ${COLUMNS}`, [id, ...Object.values(parsed.row)])
      : await sql().query(`select ${COLUMNS} from prospects where id = $1`, [id])
    if (parsed.row.estado && parsed.row.estado !== before.estado) await logEvent(id, 'Estado', `${before.estado} → ${parsed.row.estado}`)
    if (evento && typeof evento === 'object') await logEvent(id, evento.tipo, evento.texto)
    return NextResponse.json(toProspect(row))
  } catch (error) {
    if (isDuplicate(error)) return duplicate()
    console.error('[admin] prospects PUT failed:', error)
    return NextResponse.json({ error: 'No se pudo guardar el prospecto' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Prospecto inválido' }, { status: 400 })
  try {
    await sql().query('delete from prospects where id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin] prospects DELETE failed:', error)
    return NextResponse.json({ error: 'No se pudo eliminar el prospecto' }, { status: 500 })
  }
}
