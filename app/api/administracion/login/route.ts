import { after, NextResponse } from 'next/server'
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/admin/admin-session'
import { verifyAdminCredentials } from '@/lib/admin/admin-auth'
import { sql } from '@/lib/admin/db'
import { clearFailures, loginBlocked, recordFailure } from '@/lib/admin/login-guard'
import { sendToAll } from '@/lib/admin/push'
import { verifyTotp } from '@/lib/admin/totp'

// En Vercel x-forwarded-for lo pone la plataforma con la IP real (el cliente no puede falsearla).
function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

const fail = async (ip: string, email: string, error: string) => {
  await recordFailure(ip, email)
  // Demora fija: hace más lento probar contraseñas en serie.
  await new Promise((resolve) => setTimeout(resolve, 700))
  return NextResponse.json({ error }, { status: 401 })
}

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }
  const ip = clientIp(request)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : ''
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : ''
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''

  try {
    if (await loginBlocked(ip, email)) return NextResponse.json({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' }, { status: 429 })
    const admin = await verifyAdminCredentials(email, password)
    if (!admin) return fail(ip, email, 'Email o contraseña incorrectos')

    // Con la verificación en dos pasos activa, además de la contraseña hace falta el código de la app.
    if (admin.totpSecret) {
      if (!code) return NextResponse.json({ needCode: true, error: 'Ingresá el código de 6 dígitos de tu app de autenticación' }, { status: 401 })
      const step = verifyTotp(admin.totpSecret, code, Date.now(), admin.totpLastStep)
      if (step === null) return fail(ip, email, 'Código incorrecto o vencido')
      await sql().query('update admin_users set totp_last_step = $2 where id = $1', [admin.id, step])
    }

    await clearFailures(ip, email)
    // Aviso al celular de cada ingreso: si no fuiste vos, te enterás en el momento.
    const lugar = [request.headers.get('x-vercel-ip-city'), request.headers.get('x-vercel-ip-country')].filter(Boolean).map((v) => decodeURIComponent(v!)).join(', ')
    after(() => sendToAll({ title: 'Nuevo ingreso al panel', body: `Se inició sesión${lugar ? ` desde ${lugar}` : ''}. Si no fuiste vos, cambiá la contraseña.`, url: '/administracion/seguridad' }).catch((e) => console.error('[admin] login push failed:', e)))

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, createSessionToken(admin.id), sessionCookieOptions())
    return response
  } catch (error) {
    console.error('[admin] login check failed:', error)
    return NextResponse.json({ error: 'No se pudo verificar el acceso. Probá de nuevo en unos minutos.' }, { status: 503 })
  }
}
