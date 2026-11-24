import { redirect } from 'next/navigation'
import { ProjectDetail } from '@/components/admin/project-detail'
import { SessionGuard } from '@/components/admin/session-guard'
import { getAdminSession } from '@/lib/admin/admin-session'

export const metadata = { title: 'Base de datos' }

export default async function ProjectPage() {
  if (!(await getAdminSession())) redirect('/administracion/login')
  return (
    <>
      <SessionGuard />
      <ProjectDetail />
    </>
  )
}
