import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { isDbConfigured, sql } from '@/lib/admin/db'
import { newTotpSecret, otpauthUrl, verifyTotp } from '@/lib/admin/totp'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD = 12
type Admin = { id: string; email: string; password_hash: string; totp_secret: string | null; totp_last_step: string | null }

async function currentAdmin() {
  const session = await getAdminSession()
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (!isDbConfigured()) return { error: NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 503 }) }
  const [admin] = (await sql().query('select id, email, password_hash, totp_secret, totp_last_step from admin_users where id::text = $1', [session.id])) as Admin[]
  // En local con el acceso sin login no hay un admin real para configurar.
  if (!admin) return { error: NextResponse.json({ error: 'Iniciá sesión con tu usuario para cambiar la seguridad' }, { status: 400 }) }
  return { admin }
}

const readJson = (request: Request): Promise<Record<string, unknown>> => request.json().then((b) => (b && typeof b === 'object' ? b : {}), () => ({}))
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export async function GET() {
  const { admin, error } = await currentAdmin()
  if (error) return error
  return NextResponse.json({ email: admin.email, totp: !!admin.totp_secret })
}

export async function POST(request: Request) {
  try {
    const { admin, error } = await currentAdmin()
    if (error) return error
    const body = await readJson(request)
    const lastStep = Number(admin.totp_last_step ?? -1)

    switch (body.action) {
      // Paso 1: secreto nuevo y su QR. Todavía no se guarda: recién al confirmar con un código.
      case 'totp-start': {
        if (admin.totp_secret) return NextResponse.json({ error: 'La verificación en dos pasos ya está activa' }, { status: 400 })
        const secret = newTotpSecret()
        const qr = await QRCode.toString(otpauthUrl(secret, admin.email), { type: 'svg', margin: 1 })
        return NextResponse.json({ secret, qr })
      }
      case 'totp-confirm': {
        const secret = str(body.secret)
        if (!/^[A-Z2-7]{32}$/.test(secret)) return NextResponse.json({ error: 'Secreto inválido' }, { status: 400 })
        const step = verifyTotp(secret, str(body.code))
        if (step === null) return NextResponse.json({ error: 'El código no coincide. Revisá la hora del celular y probá con el siguiente.' }, { status: 400 })
        await sql().query('update admin_users set totp_secret = $2, totp_last_step = $3 where id = $1', [admin.id, secret, step])
        return NextResponse.json({ totp: true })
      }
      // Apagarla pide un código vigente: con la sesión robada sola no alcanza.
      case 'totp-off': {
        if (!admin.totp_secret) return NextResponse.json({ totp: false })
        if (verifyTotp(admin.totp_secret, str(body.code), Date.now(), lastStep) === null) return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
        await sql().query('update admin_users set totp_secret = null, totp_last_step = null where id = $1', [admin.id])
        return NextResponse.json({ totp: false })
      }
      case 'password': {
        const next = str(body.next)
        if (!(await bcrypt.compare(str(body.current), admin.password_hash))) return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 })
        if (next.length < MIN_PASSWORD || next.length > 200) return NextResponse.json({ error: `La nueva contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 })
        await sql().query('update admin_users set password_hash = $2 where id = $1', [admin.id, await bcrypt.hash(next, 12)])
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }
  } catch (error) {
    console.error('[admin] seguridad failed:', error)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
