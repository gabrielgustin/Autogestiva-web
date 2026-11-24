'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, Database, HardDrive, Pause, Play, RefreshCw, Server, Wallet } from 'lucide-react'
import { AdminShell, Badge, EmptyState, PageHeader, Stat, btn, card, useConfirm } from '@/components/admin/ui'
import { MonthField } from '@/components/admin/pickers'

type Cost = { compute: number; storage: number; restore: number; snapshots: number; branches: number; transfer: number; total: number }
type Spike = { date: string; cost: number; average: number }
type ProjectAlert = { type: 'transfer' | 'branches'; message: string }
type Project = { id: string; name: string; region: string; plan: string; endpointId: string | null; endpointStatus: string; computeHours: number | null; storageGbHours: number | null; transferGb: number | null; storageBytes: number | null; cost: Cost; projectedTotal: number; spike: Spike | null; alerts: ProjectAlert[] }
type Data = { projects: Project[]; organizations: { id: string; name: string }[]; cost: { total: number; projected: number; elapsedDays: number; daysInMonth: number }; period?: { month?: string; from?: string; to?: string } | null; diagnostics?: string[]; consumptionAvailable?: boolean; syncedAt: string }

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const unavailable = 'No disponible'
const monthName = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  return year && month ? new Date(year, month - 1, 15).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : value
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return unavailable
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1000 && index < units.length - 1) { value /= 1000; index++ }
  return `${number.format(value)} ${units[index]}`
}

function usage(value: number | null, unit: string) {
  if (value === null) return unavailable
  if (unit === 'GB') return formatBytes(value * 1e9)
  return `${number.format(value)} ${unit}`
}

const isIdle = (project: Project) => /idle|suspend/i.test(project.endpointStatus)

export default function InfrastructureDashboard() {
  const currentMonth = new Date().toLocaleDateString('sv-SE').slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [loadedMonth, setLoadedMonth] = useState(currentMonth)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [controlling, setControlling] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  const requestId = useRef(0)
  const load = useCallback(async (selectedMonth: string) => {
    const id = ++requestId.current
    const valid = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : currentMonth
    if (valid !== selectedMonth) setMonth(valid)
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/administracion/neon?month=${valid}`, { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/administracion/login'); return }
      const body = await response.json().catch(() => null)
      if (id !== requestId.current) return
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo conectar con Neon.')
      setData(body)
      setLoadedMonth(valid)
    } catch (caught) {
      if (id !== requestId.current) return
      setError(caught instanceof Error && caught.message ? caught.message : 'No se pudieron sincronizar los proyectos.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [currentMonth])

  useEffect(() => { load(currentMonth) }, [load, currentMonth])

  async function controlCompute(project: Project, action: 'suspend' | 'start') {
    if (!project.endpointId) return
    const verb = action === 'suspend' ? 'suspender' : 'reactivar'
    const ok = await confirm({
      title: `¿${action === 'suspend' ? 'Suspender' : 'Reactivar'} ${project.name}?`,
      message: action === 'suspend'
        ? 'La base deja de consumir compute hasta que alguien la vuelva a usar o la reactives. No se borra ningún dato.'
        : 'El servidor de la base vuelve a encenderse. No cambia ningún dato.',
      confirmLabel: action === 'suspend' ? 'Suspender' : 'Reactivar',
    })
    if (!ok) return
    setControlling(project.id)
    try {
      const response = await fetch('/api/administracion/neon/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, endpointId: project.endpointId, action }) })
      if (!response.ok) throw new Error()
      await load(loadedMonth)
    } catch {
      setError(`No se pudo ${verb} el compute de ${project.name}.`)
    } finally {
      setControlling(null)
    }
  }

  const totals = useMemo(() => {
    const projects = data?.projects ?? []
    const sum = (key: 'computeHours' | 'storageBytes' | 'transferGb') => {
      const values = projects.map((project) => project[key]).filter((value): value is number => value !== null)
      return values.length ? values.reduce((total, value) => total + value, 0) : null
    }
    return { compute: sum('computeHours'), storage: sum('storageBytes'), transfer: sum('transferGb') }
  }, [data])

  const sortedProjects = useMemo(() => [...(data?.projects ?? [])].sort((a, b) => b.cost.total - a.cost.total), [data])
  const spikes = sortedProjects.filter((project) => project.spike)
  const limitAlerts = sortedProjects.flatMap((project) => project.alerts.map((alert) => ({ ...alert, project: project.name, id: `${project.id}-${alert.type}` })))
  const costUnknown = data?.consumptionAvailable === false
  // Sin datos (cargando o con error) se muestra un guion, nunca ceros que parezcan reales.
  const showValue = (value: string) => (data ? value : '—')

  return (
    <AdminShell>
      <PageHeader eyebrow="Neon" title="Infraestructura" description="Consumo y costo de las bases de datos de todos tus proyectos.">
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); load(month) }}>
          <MonthField ariaLabel="Mes a consultar" value={month} max={currentMonth} onChange={(value) => { setMonth(value); load(value) }} />
          <button type="submit" disabled={loading} className={btn.secondary}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Cargando' : month === loadedMonth ? 'Actualizar' : 'Consultar'}
          </button>
        </form>
      </PageHeader>

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}{data ? ' Se muestran los últimos datos cargados.' : ''}</span>
          <button type="button" onClick={() => load(month)} disabled={loading} className={btn.secondary}>{loading ? 'Reintentando…' : 'Reintentar'}</button>
        </div>
      )}

      {data && ((data.diagnostics?.length ?? 0) > 0 || costUnknown) && (
        <section role="status" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Datos incompletos</p>
          <p className="mt-1">{costUnknown ? 'No se pudo leer el consumo desde Neon: los gastos y proyecciones no son confiables. ' : ''}Probá actualizar en unos minutos.</p>
          {!!data.diagnostics?.length && <ul className="mt-2 list-disc pl-5 text-amber-800">{data.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>
      )}

      <section aria-label="Costo del mes" className="mb-4 grid gap-3 md:mb-6 md:grid-cols-2 md:gap-4">
        <div className="rounded-2xl bg-ink p-5 text-white md:p-6">
          <p className="eyebrow text-[10px] text-white/55">Gasto de {monthName(loadedMonth)}</p>
          <p className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl">{showValue(costUnknown ? unavailable : money.format(data?.cost.total ?? 0))}</p>
          <p className="mt-2 text-sm text-white/60">{data ? `Acumulado al día ${data.cost.elapsedDays} de ${data.cost.daysInMonth}` : 'Sin datos'}</p>
        </div>
        <div className={`${card} p-5 md:p-6`}>
          <p className="eyebrow text-[10px] text-muted-ink">Proyección a fin de mes</p>
          <p className="font-display mt-3 text-4xl font-bold tracking-tight text-brand md:text-5xl">{showValue(costUnknown ? unavailable : money.format(data?.cost.projected ?? 0))}</p>
          <p className="mt-2 text-sm text-muted-ink">Según el ritmo de gasto actual</p>
        </div>
      </section>

      <section aria-label="Consumo" className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={<Server />} label="Proyectos" value={showValue(number.format(data?.projects.length ?? 0))} detail={data ? `${data.organizations.length} ${data.organizations.length === 1 ? 'organización' : 'organizaciones'}` : undefined} />
        <Stat icon={<Activity />} label="Compute" value={showValue(usage(totals.compute, 'h'))} detail="Horas del mes" />
        <Stat icon={<HardDrive />} label="Almacenamiento" value={showValue(formatBytes(totals.storage))} detail="Tamaño actual" />
        <Stat icon={<ArrowUpRight />} label="Transferencia" value={showValue(usage(totals.transfer, 'GB'))} detail="Total del mes" />
      </section>

      {(limitAlerts.length > 0 || spikes.length > 0) && (
        <section role="alert" className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 md:p-5">
          <p className="font-display text-lg font-bold tracking-tight">Para revisar</p>
          <ul className="mt-2 space-y-1.5">
            {limitAlerts.map((alert) => <li key={alert.id}><span className="font-semibold">{alert.project}</span>: {alert.message}.</li>)}
            {spikes.map((project) => <li key={project.id}><span className="font-semibold">{project.name}</span>: gastó {money.format(project.spike!.cost)} el {project.spike!.date}, contra un promedio diario de {money.format(project.spike!.average)}.</li>)}
          </ul>
        </section>
      )}

      <section className={`${card} overflow-hidden`} aria-label="Proyectos">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 md:px-5">
          <h2 className="font-display text-lg font-bold tracking-tight">Proyectos{data && <span className="text-muted-ink"> · {data.projects.length}</span>}</h2>
          <p className="text-xs text-muted-ink">Tocá un proyecto para ver sus tablas</p>
        </div>
        <div className="hidden border-b border-line bg-paper/60 px-5 py-2.5 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_repeat(3,minmax(0,0.8fr))_13rem] md:gap-4">
          {['Proyecto', 'Gasto', 'Compute', 'Storage', 'Transfer'].map((label, i) => <div key={label} className={`eyebrow text-[10px] text-muted-ink ${i > 1 ? 'text-right' : ''}`}>{label}</div>)}
          <div className="eyebrow text-right text-[10px] text-muted-ink">Estado</div>
        </div>
        <div className="divide-y divide-line">
          {loading && !data ? (
            [1, 2, 3].map((i) => <div className="h-20 animate-pulse bg-paper/70" key={i} />)
          ) : sortedProjects.length === 0 ? (
            <EmptyState>{error ? 'No se pudieron leer los proyectos.' : 'No hay proyectos para mostrar.'}</EmptyState>
          ) : (
            sortedProjects.map((project) => {
              const idle = isIdle(project)
              const busy = controlling === project.id
              return (
                <div key={project.id} className="px-4 py-3.5 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_repeat(3,minmax(0,0.8fr))_13rem] md:items-center md:gap-4 md:px-5">
                  <Link href={`/administracion/proyectos/${encodeURIComponent(project.id)}`} className="group flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand transition-colors group-hover:bg-brand group-hover:text-white"><Database className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold group-hover:text-brand">
                        <span className="truncate">{project.name}</span>
                        {project.spike && <Badge tone="orange">Pico</Badge>}
                      </span>
                      <span className="block truncate text-xs text-muted-ink">{project.region} · {project.plan}</span>
                    </span>
                  </Link>
                  <div className="mt-3 flex items-baseline justify-between md:mt-0 md:block">
                    <span className="text-xs text-muted-ink md:hidden">Gasto</span>
                    <span>
                      <span className="font-semibold text-brand">{money.format(project.cost.total)}</span>
                      <span className="ml-2 text-xs text-muted-ink md:ml-0 md:block">Proy. {money.format(project.projectedTotal)}</span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-paper/70 p-2.5 text-center md:contents">
                    <Metric label="Compute" value={usage(project.computeHours, 'h')} />
                    <Metric label="Storage" value={formatBytes(project.storageBytes)} />
                    <Metric label="Transfer" value={usage(project.transferGb, 'GB')} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 md:mt-0 md:justify-end">
                    <Badge tone={idle || project.endpointStatus === 'unknown' ? 'gray' : 'green'}>{idle ? 'En reposo' : project.endpointStatus === 'unknown' ? 'Sin estado' : 'Activo'}</Badge>
                    {project.endpointId && (
                      <button type="button" onClick={() => controlCompute(project, idle ? 'start' : 'suspend')} disabled={busy} className={`${btn.secondary} h-8 px-3 text-xs`} aria-label={`${idle ? 'Reactivar' : 'Suspender'} el compute de ${project.name}`}>
                        {idle ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
                        {busy ? '…' : idle ? 'Reactivar' : 'Suspender'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <p className="mt-4 flex items-center gap-2 text-xs text-muted-ink">
        <Wallet className="size-3.5" aria-hidden="true" />
        {data?.syncedAt ? `Datos de Neon al ${new Date(data.syncedAt).toLocaleString('es-AR')}` : 'Conectando con Neon…'}
      </p>
      {confirmDialog}
    </AdminShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 md:text-right">
      <div className="text-[10px] uppercase tracking-wide text-ink/40 md:hidden">{label}</div>
      <div className="truncate text-sm font-semibold" title={value}>{value === unavailable ? '—' : value}</div>
    </div>
  )
}
