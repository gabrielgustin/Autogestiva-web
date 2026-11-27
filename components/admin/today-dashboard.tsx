'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, CircleDollarSign, Flame, Server } from 'lucide-react'
import { buildClientAlerts, describeDays } from '@/lib/admin/client-alerts'
import type { ClientTask, SheetClient } from '@/lib/admin/clients-shared'
import { isAutoDebit } from '@/lib/admin/payments'
import { CERRADOS, EN_CURSO, isoIn, waLink, type Prospect } from '@/lib/admin/prospects'
import { Agenda, type AgendaItem } from '@/components/admin/agenda'
import { AdminShell, PageHeader, Stat, card } from '@/components/admin/ui'

type Neon = { cost: { total: number; projected: number }; projects: { id: string; name: string; spike: { date: string; cost: number } | null; alerts: { message: string }[] }[] }
type Toast = { message: string; tone: 'ok' | 'error' }

const clean = (value: string) => (value && value.trim() !== '-' ? value.trim() : '')
const usd = (value: number) => value.toLocaleString('es-AR', { style: 'currency', currency: 'USD' })
const WEEK = 7

// Inicio del panel: todo lo que hay que atender hoy (ventas, clientes, cobros e infraestructura) en una sola lista.
export function TodayDashboard() {
  const router = useRouter()
  const today = isoIn(0)
  const [prospects, setProspects] = useState<Prospect[] | null>(null)
  const [clients, setClients] = useState<SheetClient[] | null>(null)
  const [tasks, setTasks] = useState<ClientTask[]>([])
  const [mp, setMp] = useState<{ pagos: Record<string, string>; suscriptos: Set<string> } | null>(null)
  const [neon, setNeon] = useState<Neon | null | 'error'>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json' } })
    if (response.status === 401) { router.replace('/administracion/login'); throw new Error('La sesión venció') }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Algo salió mal')
    return data
  }, [router])

  useEffect(() => {
    const fail = (e: Error) => setError(e.message)
    api('/api/administracion/prospects').then(setProspects).catch(fail)
    api('/api/administracion/clients').then(setClients).catch(fail)
    api('/api/administracion/clients/tasks').then(setTasks).catch(fail)
    // Mercado Pago y Neon son opcionales: si no responden, la agenda sale igual.
    api('/api/administracion/mercadopago').then((d) => setMp({ pagos: d.pagos ?? {}, suscriptos: new Set(d.suscriptos ?? []) })).catch(() => {})
    api('/api/administracion/neon').then(setNeon).catch(() => setNeon('error'))
  }, [api])

  async function done(run: () => Promise<unknown>, ok: string) {
    try {
      await run()
      setToast({ message: ok, tone: 'ok' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'No se pudo guardar', tone: 'error' })
    }
  }

  const { hoy, semana, porCobrar } = useMemo(() => {
    const limit = isoIn(WEEK)
    const all: AgendaItem[] = []
    for (const p of prospects ?? []) {
      if (!p.proximoFecha || CERRADOS.includes(p.estado) || p.proximoFecha > limit) continue
      all.push({
        key: `p-${p.id}`,
        fecha: p.proximoFecha,
        titulo: p.negocio,
        tag: 'Prospecto',
        detalle: `${p.proximoPaso || 'Seguimiento'} · ${p.estado}`,
        whatsapp: !!waLink(p.whatsapp),
        onOpen: () => router.push(`/administracion/prospectos?abrir=${p.id}`),
        onDone: () => done(async () => {
          const updated: Prospect = await api('/api/administracion/prospects', { method: 'PUT', body: JSON.stringify({ id: p.id, proximoPaso: '', proximoFecha: '', evento: { tipo: 'Hecho', texto: p.proximoPaso || 'Seguimiento' } }) })
          setProspects((list) => list?.map((x) => (x.id === p.id ? updated : x)) ?? null)
        }, `${p.negocio}: hecho`),
      })
    }
    const byRow = new Map((clients ?? []).map((c) => [c.row, c]))
    const name = (c: SheetClient) => clean(c.empresa) || `${c.nombre} ${c.apellido}`
    for (const task of tasks) {
      const c = byRow.get(task.clientId)
      if (!c || task.fecha > limit) continue
      all.push({
        key: `t-${task.id}`,
        fecha: task.fecha,
        titulo: name(c),
        tag: 'Cliente',
        detalle: [task.texto, clean(c.producto)].filter(Boolean).join(' · '),
        whatsapp: !!clean(c.telefono),
        onOpen: () => router.push(`/administracion/clientes?abrir=${c.row}`),
        onDone: () => done(async () => {
          await api('/api/administracion/clients/tasks', { method: 'PUT', body: JSON.stringify({ id: task.id }) })
          setTasks((list) => list.filter((x) => x.id !== task.id))
        }, 'Hecho, salió de la agenda'),
      })
    }
    // Cobros, dominios y links de suscripción: los mismos avisos que «Para atender» en Clientes.
    const needsSubscription = (c: SheetClient) => !!mp && !!clean(c.plan) && isAutoDebit(c.metodoPago) && !mp.suscriptos.has(c.empresa)
    const alerts = clients ? buildClientAlerts(clients, new Date(), mp?.pagos ?? {}, needsSubscription) : []
    for (const alert of alerts) {
      const row = alert.id.slice(alert.id.indexOf('-') + 1)
      all.push({
        key: alert.id,
        fecha: alert.date,
        titulo: alert.cliente,
        tag: alert.type === 'pago' ? 'Cobro' : alert.type === 'dominio' ? 'Dominio' : 'Suscripción',
        detalle: alert.type === 'suscripcion' ? 'Enviar el link de suscripción' : `${alert.detalle} · ${describeDays(alert.days)}`,
        onOpen: () => router.push(`/administracion/clientes?abrir=${row}`),
      })
    }
    all.sort((a, b) => a.fecha.localeCompare(b.fecha))
    return {
      hoy: all.filter((item) => item.fecha <= today),
      semana: all.filter((item) => item.fecha > today),
      porCobrar: alerts.filter((a) => a.type === 'pago' && a.days <= 0).length,
    }
  }, [prospects, clients, tasks, mp, today, router]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = prospects === null || clients === null
  const enCurso = (prospects ?? []).filter((p) => EN_CURSO.includes(p.estado)).length
  const neonAlerts = neon && neon !== 'error' ? neon.projects.flatMap((p) => [...(p.spike ? [`${p.name}: gastó ${usd(p.spike.cost)} el ${p.spike.date}`] : []), ...p.alerts.map((a) => `${p.name}: ${a.message}`)]) : []
  const fecha = new Date(`${today}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <AdminShell>
      <PageHeader eyebrow={fecha} title="Hoy" description="Lo que toca atender: seguimientos de ventas, pendientes y cobros de clientes, y el gasto de las bases." />

      {error && <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Para hoy" value={loading ? '…' : hoy.length} detail={hoy.length ? 'Toca hoy o está atrasado' : 'Nada pendiente'} icon={<CalendarClock />} />
        <Stat label="Cobros vencidos" value={loading ? '…' : porCobrar} detail={mp ? 'Con Mercado Pago al día' : 'Según la planilla'} icon={<CircleDollarSign />} />
        <Stat label="En conversación" value={loading ? '…' : enCurso} detail="Prospectos contactados o interesados" icon={<Flame />} />
        <Stat label="Neon este mes" value={neon === null ? '…' : neon === 'error' ? '—' : usd(neon.cost.projected)} detail={neon && neon !== 'error' ? `Proyectado · van ${usd(neon.cost.total)}` : neon === 'error' ? 'No se pudo leer' : 'Consultando'} icon={<Server />} />
      </div>

      {neonAlerts.length > 0 && (
        <Link href="/administracion" className="mt-6 block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <p className="font-semibold">Infraestructura para revisar</p>
          <ul className="mt-1 list-disc pl-5">{neonAlerts.map((text) => <li key={text}>{text}</li>)}</ul>
        </Link>
      )}

      {loading ? (
        <div className={`${card} mt-6 h-40 animate-pulse bg-paper/70`} />
      ) : hoy.length === 0 && semana.length === 0 ? (
        <div className={`${card} mt-6 px-6 py-14 text-center text-sm text-muted-ink`}>No hay nada agendado para esta semana.</div>
      ) : (
        <>
          <Agenda className="mt-6" title="Para hoy" today={today} items={hoy} />
          <Agenda className="mt-6" title="Próximos 7 días" today={today} items={semana} />
        </>
      )}

      {toast && (
        <div role="status" className={`fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-20px_rgba(11,19,34,0.5)] sm:inset-x-auto sm:right-6 ${toast.tone === 'ok' ? 'bg-ink' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </AdminShell>
  )
}
