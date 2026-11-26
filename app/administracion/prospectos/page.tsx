import { redirect } from 'next/navigation'
import { ProspectsDashboard } from '@/components/admin/prospects-dashboard'
import { SessionGuard } from '@/components/admin/session-guard'
import { getAdminSession } from '@/lib/admin/admin-session'

export const metadata = { title: 'Prospectos' }

export default async function ProspectsPage() {
  if (!(await getAdminSession())) redirect('/administracion/login')
  return (
    <>
      <SessionGuard />
      <ProspectsDashboard />
    </>
  )
}
