'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Database, RefreshCw } from 'lucide-react'
import { DataGrid } from '@/components/admin/data-grid'
import { AdminShell, PageHeader, btn } from '@/components/admin/ui'

type Column = { name?: string; type?: string; data_type?: string; nullable?: boolean; is_nullable?: boolean }
type Table = { name?: string; table_name?: string; schema?: string; columns?: Column[] }
type SchemaResponse = { name?: string; database?: string; branch?: string; tables: Table[] }

const fetcher = async (url: string): Promise<SchemaResponse> => {
  const response = await fetch(url)
  if (response.status === 401) {
    window.location.replace('/administracion/login')
    throw new Error('La sesión expiró')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error ?? 'Error al cargar el esquema')
  return result
}

export function ProjectDetail() {
  const params = useParams<{ projectId: string }>()
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    params.projectId ? `/api/administracion/neon/schema?projectId=${encodeURIComponent(params.projectId)}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  )

  const publicTables = (data?.tables ?? [])
    .map((table) => ({ name: table.name ?? table.table_name ?? 'tabla', schema: table.schema ?? 'public' }))
    .filter((table) => table.schema === 'public')

  return (
    <AdminShell>
      <Link href="/administracion" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-ink transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a infraestructura
      </Link>
      <PageHeader
        eyebrow="Base de datos"
        title={<span className="flex items-center gap-3"><Database className="size-7 shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{data?.name ?? (error ? 'Proyecto' : 'Cargando…')}</span></span>}
        description={data ? `Base ${data.database ?? '—'} · rama ${data.branch ?? '—'} · ${publicTables.length} ${publicTables.length === 1 ? 'tabla' : 'tablas'}` : undefined}
      >
        <button type="button" onClick={() => mutate()} disabled={isValidating} className={btn.secondary}>
          <RefreshCw className={`size-4 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
          Actualizar
        </button>
      </PageHeader>

      {error && <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>}

      {isLoading ? (
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-white" />
      ) : data ? (
        <DataGrid key={params.projectId + publicTables.length} projectId={params.projectId} tables={publicTables} />
      ) : null}
    </AdminShell>
  )
}
