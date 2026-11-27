import { redirect } from 'next/navigation'
import { TodayDashboard } from '@/components/admin/today-dashboard'
import { SessionGuard } from '@/components/admin/session-guard'
import { getAdminSession } from '@/lib/admin/admin-session'

export const metadata = { title: 'Hoy' }

export default async function TodayPage() {
  if (!(await getAdminSession())) redirect('/administracion/login')
  return (
    <>
      <SessionGuard />
      <TodayDashboard />
    </>
  )
}
