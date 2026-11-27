import bcrypt from 'bcryptjs'
import { isDbConfigured, sql } from '@/lib/admin/db'

// Hash de relleno: si el email no existe igual se compara, así el tiempo de respuesta no delata qué emails están dados de alta.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Gl0XcP5ZxdSMIw6hnGWT6d8sFP0a'

export type AdminLogin = { id: string; totpSecret: string | null; totpLastStep: number }

// Compara contra admin_users (hash bcrypt). Devuelve el admin, o null si email o contraseña no coinciden.
export async function verifyAdminCredentials(email: string, password: string): Promise<AdminLogin | null> {
  if (!email.trim() || !password) return null
  if (!isDbConfigured()) throw new Error('La base de datos no está configurada')

  const [admin] = (await sql().query('select id, password_hash, totp_secret, totp_last_step from admin_users where email = $1', [email.trim().toLowerCase()])) as {
    id: string
    password_hash: string
    totp_secret: string | null
    totp_last_step: string | null
  }[]
  const ok = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH)
  return admin && ok ? { id: admin.id, totpSecret: admin.totp_secret, totpLastStep: Number(admin.totp_last_step ?? -1) } : null
}
