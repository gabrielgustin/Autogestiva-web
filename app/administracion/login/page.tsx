import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/admin/login-form'
import { getAdminSession } from '@/lib/admin/admin-session'

export const metadata = { title: 'Acceso administrador' }

export default async function LoginPage() {
  if (await getAdminSession()) redirect('/administracion/hoy')
  return (
    <main className="bg-blueprint flex min-h-screen items-start justify-center bg-paper px-4 py-10 text-ink sm:items-center sm:p-6">
      <LoginForm />
    </main>
  )
}
