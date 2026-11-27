import { redirect } from 'next/navigation'
import { SecurityPanel } from '@/components/admin/security-panel'
import { SessionGuard } from '@/components/admin/session-guard'
import { getAdminSession } from '@/lib/admin/admin-session'

export const metadata = { title: 'Seguridad' }

export default async function SecurityPage() {
  if (!(await getAdminSession())) redirect('/administracion/login')
  return (
    <>
      <SessionGuard />
      <SecurityPanel />
    </>
  )
}
