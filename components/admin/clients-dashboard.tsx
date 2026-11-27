'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarClock, Check, ChevronDown, CircleDollarSign, GripVertical, Layers, Mail, MessageCircle, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { buildClientAlerts, describeDays, type ClientAlert } from '@/lib/admin/client-alerts'
import { COLUMN_LABELS, fingerprint, type ClientInput, type ClientTask, type SheetClient } from '@/lib/admin/clients-shared'
import { currentDueDate, isAutoDebit, nextPaymentDate } from '@/lib/admin/payments'
import { AdminShell, Badge, EmptyState, Modal, PageHeader, Stat, btn, card, inputClass, useConfirm } from '@/components/admin/ui'
import { DateField, SelectField } from '@/components/admin/pickers'
import { reorder } from '@/lib/admin/reorder'
import { planAmount, profitByClient } from '@/lib/admin/profit'
import { Agenda, cuando } from '@/components/admin/agenda'
import { ClientTasks } from '@/components/admin/client-tasks'
import { ClientHistory } from '@/components/admin/client-history'
import { useDragSort } from '@/components/admin/use-drag-sort'
import { ClientFields, MoneyInput, type NeonProject, emptyForm, isCustomPlan, missingFields } from '@/components/admin/client-form'

// Fecha de hoy en hora local (AAAA-MM-DD); toISOString daría el día UTC.
const todayIso = () => new Date().toLocaleDateString('sv-SE')

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—'
}

// Solo los campos editables: la API también manda `orden`, que no forma parte de la ficha ni de la huella.
function toInput(client: SheetClient): ClientInput {
  const input = {} as ClientInput
  for (const key of Object.keys(emptyForm) as (keyof ClientInput)[]) input[key] = client[key] ?? ''
  return input
}

const clean = (value: string) => (value && value.trim() !== '-' ? value.trim() : '')
const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola')}`

type ClientEntry = { key: string; members: SheetClient[] }

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

// Agrupa los servicios del mismo cliente: misma empresa o misma persona (Daniel Fortuna con Boutique ITS y Santa Remera).
function buildEntries(list: SheetClient[]): ClientEntry[] {
  const byKey = new Map<string, ClientEntry>()
  const entries: ClientEntry[] = []
  for (const client of list) {
    const company = normalizeText(clean(client.empresa))
    const person = normalizeText(`${client.nombre} ${client.apellido}`.trim())
    const keys = [company && `empresa:${company}`, person && `persona:${person}`].filter(Boolean) as string[]
    const found = [...new Set(keys.map((key) => byKey.get(key)).filter(Boolean) as ClientEntry[])]
    let entry = found[0]
    if (!entry) entries.push((entry = { key: keys[0] ?? `fila:${client.row}`, members: [] }))
    // Si este servicio une dos grupos que venían separados, se juntan en el primero.
    for (const other of found.slice(1)) {
      entry.members.push(...other.members)
      entries.splice(entries.indexOf(other), 1)
      for (const [key, value] of byKey) if (value === other) byKey.set(key, entry)
    }
    entry.members.push(client)
    for (const key of keys) byKey.set(key, entry)
  }
  // La clave no depende del orden: reordenar los servicios no debe cerrar el grupo.
  for (const entry of entries) entry.key = entry.members.map((member) => member.row).sort()[0]
  return entries
}

// Orden nuevo al poner una fila antes o después de otra. En 'root' se mueve el cliente entero; si no, un servicio dentro del suyo.
function arrange(list: SheetClient[], scope: string, row: string, target: string, after: boolean) {
  const entries = buildEntries(list)
  const entryOf = (id: string) => entries.find((entry) => entry.members.some((member) => member.row === id))
  const entry = entryOf(row)
  if (!entry) return list
  if (scope === 'root') {
    const next = reorder(entries, (item) => item.key, entry.key, entryOf(target)?.key ?? '', after)
    return next === entries ? list : next.flatMap((item) => item.members)
  }
  const members = reorder(entry.members, (member) => member.row, row, target, after)
  return members === entry.members ? list : entries.flatMap((item) => (item === entry ? members : item.members))
}

// Pendiente más próximo entre los servicios dados (la lista ya viene ordenada por fecha).
const nextTask = (tasks: ClientTask[], rows: string[]) => tasks.find((task) => rows.includes(task.clientId))

const money = (value: number) => `$${value.toLocaleString('es-AR')}`
const alertRow = (alert: ClientAlert) => alert.id.slice(alert.id.indexOf('-') + 1)

const ALERTS_PREVIEW = 6

type Toast = { message: string; tone: 'ok' | 'error' }

export function ClientsDashboard() {
  const router = useRouter()
  const [clients, setClients] = useState<SheetClient[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState('all')
  const [servidor, setServidor] = useState('all')
  const [editing, setEditing] = useState<SheetClient | null>(null)
  const [addingTo, setAddingTo] = useState<SheetClient | null>(null)
  const [selectedClient, setSelectedClient] = useState<SheetClient | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<ClientInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [customPlan, setCustomPlan] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [mpPaid, setMpPaid] = useState<Record<string, string>>({})
  const [mpSubs, setMpSubs] = useState<Set<string> | null>(null)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [tasks, setTasks] = useState<ClientTask[]>([])
  // Costo proyectado del mes por proyecto de Neon (USD) y dólar tarjeta: para la rentabilidad de cada cliente.
  const [neon, setNeon] = useState<{ projects: NeonProject[]; costUsd: Record<string, number> } | null>(null)
  const [dolar, setDolar] = useState<number | null>(null)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'ok') => setToast({ message, tone }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/administracion/clients', { cache: 'no-store' })
      if (response.status === 401) return router.replace('/administracion/login')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudieron cargar los clientes')
      setClients(result)
      // Desde «Hoy» se llega con ?abrir=<id> para ver el detalle directamente (solo la primera vez).
      const params = new URLSearchParams(window.location.search)
      const abrir = result.find((client: SheetClient) => client.row === params.get('abrir'))
      if (abrir) {
        setSelectedClient(abrir)
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }, [router])

  const tasksApi = useCallback(async (method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
    const response = await fetch('/api/administracion/clients/tasks', { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (response.status === 401) { router.replace('/administracion/login'); throw new Error('La sesión expiró') }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar')
    return result
  }, [router])

  const loadMercadoPago = useCallback(() => {
    // Pagos confirmados por Mercado Pago; si falla, los avisos quedan como estaban.
    fetch('/api/administracion/mercadopago', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!d?.pagos) return; setMpPaid(d.pagos); setMpSubs(new Set(d.suscriptos)) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadMercadoPago()
    tasksApi('GET').then(setTasks).catch((e) => notify(e.message, 'error'))
    fetch('/api/administracion/neon', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { projects: { id: string; name: string; projectedTotal: number }[] } | null) => {
        if (d) setNeon({ projects: d.projects.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), costUsd: Object.fromEntries(d.projects.map((p) => [p.id, p.projectedTotal])) })
      })
      .catch(() => {})
    fetch('/api/administracion/dolar', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setDolar(d.venta) }).catch(() => {})
  }, [load, loadMercadoPago, tasksApi, notify])


  const plans = useMemo(() => [...new Set(clients.map((client) => clean(client.plan)).filter(Boolean))].sort((a, b) => planAmount(a) - planAmount(b)), [clients])
  const servers = useMemo(() => [...new Set(clients.map((client) => clean(client.servidor)).filter(Boolean))].sort(), [clients])
  const activeProducts = useMemo(() => clients.filter((client) => clean(client.producto)).length, [clients])
  const monthlyRevenue = useMemo(() => clients.reduce((total, client) => total + planAmount(client.plan), 0), [clients])
  const nextExpiringDomain = useMemo(() => {
    const today = todayIso()
    return clients.filter((client) => client.dominioVencimiento && client.dominioVencimiento >= today).sort((a, b) => a.dominioVencimiento.localeCompare(b.dominioVencimiento))[0] ?? null
  }, [clients])
  // Cliente con plan que todavía no tiene suscripción en Mercado Pago (solo si la consulta respondió).
  const needsSubscription = (client: SheetClient) => !!mpSubs && !!clean(client.plan) && isAutoDebit(client.metodoPago) && !mpSubs.has(client.empresa)
  const alerts = useMemo(() => buildClientAlerts(clients, new Date(), mpPaid, needsSubscription), [clients, mpPaid, mpSubs]) // eslint-disable-line react-hooks/exhaustive-deps
  // Empresas con más de un aviso (p. ej. La Comanda con dos servicios): ahí el título suma el producto para distinguirlos.
  const repeatedCompanies = useMemo(() => new Set(alerts.map((a) => a.cliente).filter((c, i, all) => all.indexOf(c) !== i)), [alerts])
  const clientByRow = useMemo(() => new Map(clients.map((client) => [client.row, client])), [clients])
  const filtered = useMemo(() => {
    const needle = normalizeText(query)
    return clients.filter((client) => {
      const text = normalizeText(`${client.nombre} ${client.apellido} ${client.empresa} ${client.producto} ${client.dominio} ${client.mail} ${client.telefono}`)
      return text.includes(needle) && (plan === 'all' || clean(client.plan) === plan) && (servidor === 'all' || clean(client.servidor) === servidor)
    })
  }, [clients, plan, query, servidor])
  const visibleEntries = useMemo(() => buildEntries(filtered), [filtered])
  const totalEntries = useMemo(() => buildEntries(clients).length, [clients])
  const profit = useMemo(() => {
    if (!neon || !dolar) return null
    const rows = profitByClient(buildEntries(clients).map((entry) => ({ key: entry.key, nombre: [...new Set(entry.members.map((m) => clean(m.empresa) || `${m.nombre} ${m.apellido}`))].join(' · '), members: entry.members })), neon.costUsd, dolar)
    const asignadas = new Set(rows.flatMap((row) => row.bases))
    const sinAsignar = neon.projects.filter((p) => !asignadas.has(p.id) && (neon.costUsd[p.id] ?? 0) > 0)
    return { rows, sinAsignar, ganancia: rows.reduce((t, r) => t + r.ganancia, 0), costo: rows.reduce((t, r) => t + r.costoArs, 0) }
  }, [clients, neon, dolar])
  const isFiltering = query.trim() !== '' || plan !== 'all' || servidor !== 'all'
  const mpPaidFor = (client: SheetClient) => (isAutoDebit(client.metodoPago) ? mpPaid[client.empresa] ?? '' : '')
  const mpConfirmed = Object.keys(mpPaid).length
  const unsubscribed = mpSubs ? new Set(clients.filter(needsSubscription).map((client) => clean(client.empresa) || client.row)).size : 0
  const firstLoad = loading && clients.length === 0

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Con `base`, es un servicio más para un cliente existente: se copian sus datos de contacto y la misma empresa lo agrupa.
  function openNew(base?: SheetClient) {
    setSelectedClient(null)
    setEditing(null)
    setAddingTo(base ?? null)
    setForm(base ? { ...emptyForm, nombre: base.nombre, apellido: base.apellido, empresa: base.empresa, mail: base.mail, telefono: base.telefono } : { ...emptyForm })
    setCustomPlan(false)
    setFormError('')
    setIsFormOpen(true)
  }
  function openEdit(client: SheetClient) {
    setSelectedClient(null)
    setAddingTo(null)
    setEditing(client)
    setForm(toInput(client))
    setCustomPlan(isCustomPlan(client.plan))
    setFormError('')
    setIsFormOpen(true)
  }
  const closeForm = useCallback(() => { setEditing(null); setIsFormOpen(false) }, [])
  const closeDetails = useCallback(() => setSelectedClient(null), [])

  async function send(method: 'POST' | 'PUT' | 'DELETE' | 'PATCH', body: unknown) {
    const response = await fetch('/api/administracion/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status === 401) { router.replace('/administracion/login'); throw new Error('La sesión expiró') }
    const result = await response.json().catch(() => ({}))
    // Si el cliente cambió en otra pestaña, se recarga la lista sola para que el próximo intento ya parta de lo nuevo.
    if (response.status === 409 || response.status === 404) load()
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar')
    return result
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    // Los selectores propios no usan la validación nativa: se revisan acá los obligatorios.
    const missing = missingFields(form)
    if (missing.length) return setFormError(`Completá: ${missing.join(', ')}.`)
    setSaving(true)
    setFormError('')
    try {
      await send(editing ? 'PUT' : 'POST', editing ? { ...form, row: editing.row, expected: fingerprint(toInput(editing)) } : form)
      notify(editing ? 'Cambios guardados' : addingTo ? 'Servicio agregado' : 'Cliente creado')
      closeForm()
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  // Guarda un dato suelto desde el detalle, sin abrir el formulario.
  async function patchClient(client: SheetClient, patch: Partial<ClientInput>, ok: string) {
    setBusyRow(client.row)
    try {
      const saved = await send('PUT', { ...toInput(client), ...patch, row: client.row, expected: fingerprint(toInput(client)) })
      notify(ok)
      setSelectedClient((current) => (current?.row === client.row ? { ...current, ...saved } : current))
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    } finally {
      setBusyRow(null)
    }
  }

  // Aviso para mandarle el link de suscripción en una fecha puntual ('' lo quita).
  const setReminder = (client: SheetClient, date: string) => patchClient(client, { avisoSuscripcion: date }, date ? `Aviso guardado para el ${formatDate(date)}` : 'Aviso quitado')

  async function markPaid(client: SheetClient) {
    const today = todayIso()
    const next = nextPaymentDate(client.metodoPago, today)
    const hasSiblings = !!clean(client.empresa) && clients.some((other) => other.row !== client.row && other.empresa === client.empresa)
    const who = `${clean(client.empresa) || `${client.nombre} ${client.apellido}`}${hasSiblings && clean(client.producto) ? ` · ${client.producto}` : ''}`
    const ok = await confirm({
      title: `¿Registrar el pago de ${who}?`,
      message: (
        <>
          Queda como pagado hoy, {formatDate(today)}{clean(client.plan) ? ` (${client.plan})` : ''}.
          {next && <> El próximo pago pasa al <strong className="font-semibold text-ink">{formatDate(next)}</strong>.</>}
        </>
      ),
      confirmLabel: 'Registrar pago',
    })
    if (!ok) return
    setBusyRow(client.row)
    try {
      await send('PUT', { ...toInput(client), ultimoPago: today, proximoPago: next, row: client.row, expected: fingerprint(toInput(client)) })
      notify(`Pago registrado: ${clean(client.empresa) || client.nombre}`)
      setSelectedClient(null)
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo registrar el pago', 'error')
    } finally {
      setBusyRow(null)
    }
  }

  async function persistOrder(reordered: SheetClient[], previous: SheetClient[]) {
    setClients(reordered)
    try {
      await send('PATCH', { ids: reordered.map((item) => item.row) })
    } catch (e) {
      setClients(previous)
      notify(e instanceof Error ? e.message : 'No se pudo guardar el orden', 'error')
    }
  }

  // Orden antes y durante el arrastre: la lista se acomoda en vivo y se guarda recién al soltar.
  const order = useRef({ before: clients, now: clients })
  const sort = useDragSort({
    onStart: () => { order.current = { before: clients, now: clients } },
    onMove: (scope, row, target, after) => {
      const next = arrange(order.current.now, scope, row, target, after)
      if (next === order.current.now) return
      order.current.now = next
      setClients(next)
    },
    onDrop: () => { if (order.current.now !== order.current.before) persistOrder(order.current.now, order.current.before) },
    onCancel: () => setClients(order.current.before),
  })

  // Lo mismo con el teclado: flechas arriba y abajo sobre la manija.
  function nudge(scope: string, rows: string[], row: string, direction: -1 | 1) {
    const target = rows[rows.indexOf(row) + direction]
    if (!target) return
    const next = arrange(clients, scope, row, target, direction > 0)
    if (next !== clients) persistOrder(next, clients)
  }

  const sortProps = (scope: string, rows: string[], row: string): SortProps => ({
    scope,
    sortKey: row,
    placeholder: sort.dragging?.scope === scope && sort.dragging.key === row,
    onPointerDown: sort.start,
    onNudge: (direction) => nudge(scope, rows, row, direction),
  })

  async function addTask(client: SheetClient, texto: string, fecha: string) {
    try {
      const task: ClientTask = await tasksApi('POST', { clientId: client.row, texto, fecha })
      setTasks((list) => [...list, task].sort((a, b) => a.fecha.localeCompare(b.fecha)))
      notify(`Agendado para el ${formatDate(fecha)}`)
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo agendar', 'error')
      return false
    }
  }

  async function doneTask(task: ClientTask) {
    try {
      await tasksApi('PUT', { id: task.id })
      setTasks((list) => list.filter((item) => item.id !== task.id))
      notify('Hecho, salió de la agenda')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    }
  }

  async function remove(client: SheetClient) {
    // Si la empresa tiene otros servicios, se borra solo este servicio y el cliente sigue.
    const isService = !!clean(client.empresa) && clients.some((other) => other.row !== client.row && other.empresa === client.empresa)
    const ok = await confirm(
      isService
        ? { title: `¿Eliminar el servicio ${clean(client.producto) || 'sin producto'} de ${client.empresa}?`, message: 'Los demás servicios de la empresa quedan como están. Esto no se puede deshacer.', confirmLabel: 'Eliminar servicio', danger: true }
        : { title: `¿Eliminar a ${client.nombre} ${client.apellido}?`, message: `${clean(client.empresa) ? `Se borra ${client.empresa} con todos sus datos. ` : ''}Esto no se puede deshacer.`, confirmLabel: 'Eliminar cliente', danger: true },
    )
    if (!ok) return
    setBusyRow(client.row)
    try {
      await send('DELETE', { row: client.row, expected: fingerprint(toInput(client)) })
      notify(isService ? 'Servicio eliminado' : 'Cliente eliminado')
      setSelectedClient(null)
      await load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar', 'error')
    } finally {
      setBusyRow(null)
    }
  }

  const rowProps = (client: SheetClient) => ({
    client,
    busy: busyRow === client.row,
    unsubscribed: needsSubscription(client),
    paidByMp: mpPaidFor(client),
    task: nextTask(tasks, [client.row]),
    today: todayIso(),
    onOpen: () => { if (!sort.moved.current) setSelectedClient(client) },
    onEdit: () => openEdit(client),
    onDelete: () => remove(client),
  })

  return (
    <AdminShell>
      <PageHeader eyebrow="Cartera" title="Clientes" description="Servicios contratados, dominios y cobros de cada cliente.">
        <button type="button" onClick={() => openNew()} className={btn.accent}>
          <Plus className="size-4" aria-hidden="true" />
          Nuevo cliente
        </button>
      </PageHeader>

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button type="button" onClick={load} className={btn.secondary}>Reintentar</button>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" aria-label="Resumen">
        <Stat label="Clientes" value={firstLoad ? '—' : totalEntries} detail={`${clients.length} servicios cargados`} icon={<UserRound />} />
        <Stat label="Productos activos" value={firstLoad ? '—' : activeProducts} icon={<Layers />} />
        <Stat label="Recaudación mensual" value={firstLoad ? '—' : money(monthlyRevenue)} detail="Suma de los planes" icon={<CircleDollarSign />} />
        <Stat
          label="Próximo dominio"
          value={<span className="block truncate">{nextExpiringDomain ? clean(nextExpiringDomain.empresa) || nextExpiringDomain.dominio : '—'}</span>}
          detail={nextExpiringDomain ? `Vence el ${formatDate(nextExpiringDomain.dominioVencimiento)}` : 'Sin fechas cargadas'}
          icon={<CalendarClock />}
        />
      </section>

      <Agenda
        className="mb-6"
        today={todayIso()}
        items={tasks.flatMap((task) => {
          const client = clientByRow.get(task.clientId)
          if (!client || task.fecha > todayIso()) return []
          return [{
            key: task.id,
            fecha: task.fecha,
            titulo: clean(client.empresa) || `${client.nombre} ${client.apellido}`,
            detalle: [task.texto, clean(client.producto)].filter(Boolean).join(' · '),
            whatsapp: !!clean(client.telefono),
            onOpen: () => setSelectedClient(client),
            onDone: () => doneTask(task),
          }]
        })}
      />

      {!firstLoad && (alerts.length > 0 || mpSubs) && (
        <section aria-label="Para atender" className={`${card} mb-6 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 md:px-5">
            <h2 className="font-display text-lg font-bold tracking-tight">
              Para atender <span className="text-muted-ink">· {alerts.length}</span>
            </h2>
            {mpSubs && (
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="green"><Check className="size-3" aria-hidden="true" />{mpConfirmed} al día por Mercado Pago</Badge>
                {unsubscribed > 0 && <Badge tone="amber">{unsubscribed} sin suscribir</Badge>}
              </div>
            )}
          </div>
          {alerts.length === 0 ? (
            <EmptyState>No hay pagos ni dominios por vencer. Todo al día.</EmptyState>
          ) : (
            <ul className="grid gap-px bg-line md:grid-cols-2">
              {(showAllAlerts ? alerts : alerts.slice(0, ALERTS_PREVIEW)).map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  client={clientByRow.get(alertRow(alert))}
                  showService={repeatedCompanies.has(alert.cliente)}
                  unsubscribed={alert.type === 'pago' && !!mpSubs && !mpSubs.has(alert.cliente)}
                  busy={busyRow === alertRow(alert)}
                  onPaid={markPaid}
                  onReminderDone={(client) => setReminder(client, '')}
                  onOpen={setSelectedClient}
                />
              ))}
              {(showAllAlerts ? alerts.length : Math.min(alerts.length, ALERTS_PREVIEW)) % 2 === 1 && <li className="hidden bg-white md:block" aria-hidden="true" />}
            </ul>
          )}
          {alerts.length > ALERTS_PREVIEW && (
            <button type="button" onClick={() => setShowAllAlerts((v) => !v)} className="w-full border-t border-line px-4 py-2.5 text-sm font-semibold text-brand hover:bg-paper/60">
              {showAllAlerts ? 'Mostrar menos' : `Ver los ${alerts.length} avisos`}
            </button>
          )}
        </section>
      )}

      {profit && <ProfitSection profit={profit} dolar={dolar!} onOpen={(key) => { const entry = buildEntries(clients).find((e) => e.key === key); if (entry) setSelectedClient(entry.members[0]) }} />}

      <section className={`${card} overflow-hidden`} aria-label="Lista de clientes">
        <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:items-center md:p-4">
          <label className="relative flex-1">
            <span className="sr-only">Buscar clientes</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, empresa, dominio o teléfono" className={`${inputClass} pl-10`} />
          </label>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <SelectFilter value={servidor} onChange={setServidor} allLabel="Todos los servidores" options={servers} />
            <SelectFilter value={plan} onChange={setPlan} allLabel="Todos los planes" options={plans} />
          </div>
        </div>

        <div className={`hidden border-b border-line bg-paper/60 px-5 py-2.5 ${rowGrid}`}>
          {['Cliente', 'Empresa y producto', 'Dominio', 'Servidor', 'Plan'].map((label) => (
            <div key={label} className="eyebrow whitespace-nowrap text-[10px] text-muted-ink">{label}</div>
          ))}
          <div />
        </div>

        <div className="divide-y divide-line">
          {firstLoad ? (
            <div className="space-y-px">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse bg-paper/70" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState>
              {isFiltering ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes. Creá el primero con “Nuevo cliente”.'}
              {isFiltering && (
                <button type="button" onClick={() => { setQuery(''); setPlan('all'); setServidor('all') }} className={`${btn.secondary} mx-auto mt-4 flex`}>Limpiar filtros</button>
              )}
            </EmptyState>
          ) : (
            visibleEntries.map((entry) => {
              const root = sortProps('root', visibleEntries.map((item) => item.members[0].row), entry.members[0].row)
              if (entry.members.length === 1) return <ClientRow key={entry.key} {...rowProps(entry.members[0])} sort={root} />
              const memberRows = entry.members.map((member) => member.row)
              return (
                <GroupRow key={entry.key} entry={entry} sort={root} task={nextTask(tasks, memberRows)} today={todayIso()} unsubscribed={entry.members.some(needsSubscription)} expanded={isFiltering || expandedGroups.has(entry.key)} onToggle={() => { if (!sort.moved.current) toggleGroup(entry.key) }} onAddService={() => openNew(entry.members[0])}>
                  {entry.members.map((client) => (
                    <ClientRow key={client.row} {...rowProps(client)} nested sort={sortProps(`grupo:${entry.key}`, memberRows, client.row)} />
                  ))}
                </GroupRow>
              )
            })
          )}
        </div>
        {!firstLoad && filtered.length > 0 && (
          <div className="border-t border-line bg-paper/60 px-5 py-2.5 text-xs text-muted-ink">
            {isFiltering ? `${filtered.length} de ${clients.length} servicios` : `${clients.length} servicios · ${totalEntries} clientes`}
          </div>
        )}
      </section>

      {selectedClient && (
        <ClientDetails
          client={selectedClient}
          busy={busyRow === selectedClient.row}
          unsubscribed={needsSubscription(selectedClient)}
          paidByMp={mpPaidFor(selectedClient)}
          onClose={closeDetails}
          onEdit={() => openEdit(selectedClient)}
          onAddService={() => openNew(selectedClient)}
          onPaid={() => markPaid(selectedClient)}
          onReminder={(date) => setReminder(selectedClient, date)}
          onDelete={() => remove(selectedClient)}
          neonBase={selectedClient.neonProyecto ? { name: neon?.projects.find((p) => p.id === selectedClient.neonProyecto)?.name ?? selectedClient.neonProyecto, usd: neon?.costUsd[selectedClient.neonProyecto] ?? null } : null}
          onSaleValue={(valorVenta) => patchClient(selectedClient, { valorVenta }, valorVenta ? `Valor de venta guardado: ${valorVenta}` : 'Valor de venta quitado')}
          tasks={<ClientTasks key={selectedClient.row} tasks={tasks.filter((task) => task.clientId === selectedClient.row)} today={todayIso()} onAdd={(texto, fecha) => addTask(selectedClient, texto, fecha)} onDone={doneTask} />}
        />
      )}

      {isFormOpen && (
        <Modal
          eyebrow="Ficha de cliente"
          title={editing ? `Editar a ${editing.nombre} ${editing.apellido}` : addingTo ? `Nuevo servicio para ${clean(addingTo.empresa) || `${addingTo.nombre} ${addingTo.apellido}`}` : 'Nuevo cliente'}
          onClose={closeForm}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={closeForm} className={btn.secondary}>Cancelar</button>
              <button type="submit" form="client-form" disabled={saving} className={btn.primary}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : addingTo ? 'Agregar servicio' : 'Crear cliente'}</button>
            </div>
          }
        >
          <form id="client-form" onSubmit={save} className="space-y-6">
            <ClientFields form={form} setForm={setForm} customPlan={customPlan} setCustomPlan={setCustomPlan} neonProjects={neon?.projects} />
            {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          </form>
        </Modal>
      )}

      {confirmDialog}

      {toast && (
        <div role="status" className={`fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-20px_rgba(11,19,34,0.5)] sm:inset-x-auto sm:right-6 ${toast.tone === 'ok' ? 'bg-ink' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </AdminShell>
  )
}

function SelectFilter({ value, onChange, allLabel, options }: { value: string; onChange: (value: string) => void; allLabel: string; options: string[] }) {
  return <SelectField ariaLabel={allLabel} value={value} onChange={onChange} options={[{ value: 'all', label: allLabel }, ...options]} className="min-w-0 md:w-52" />
}

function AlertItem({ alert, client, showService, unsubscribed, busy, onPaid, onReminderDone, onOpen }: { alert: ClientAlert; client?: SheetClient; showService: boolean; unsubscribed: boolean; busy: boolean; onPaid: (client: SheetClient) => void; onReminderDone: (client: SheetClient) => void; onOpen: (client: SheetClient) => void }) {
  return (
    <li className="flex items-center justify-between gap-3 bg-white px-4 py-3 md:px-5">
      <button type="button" onClick={() => client && onOpen(client)} className="min-w-0 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{alert.cliente}{showService && client && clean(client.producto) && <span className="font-normal text-muted-ink"> · {client.producto}</span>}</span>
          {alert.type === 'suscripcion' ? (
            <Badge tone="blue"><Bell className="size-3" aria-hidden="true" />{alert.days === 0 ? 'Enviar hoy' : `Desde hace ${-alert.days} ${alert.days === -1 ? 'día' : 'días'}`}</Badge>
          ) : (
            <Badge tone={alert.days < 0 ? 'red' : 'orange'}>{describeDays(alert.days)}</Badge>
          )}
          {unsubscribed && alert.type !== 'suscripcion' && <Badge tone="amber">Falta suscribir</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-ink">
          {alert.type === 'dominio' ? 'Dominio' : alert.type === 'suscripcion' ? 'Enviar el link de suscripción' : 'Pago'} · {alert.detalle} · {formatDate(alert.date)}
        </span>
      </button>
      {alert.type === 'suscripcion' && client && (
        <div className="flex shrink-0 items-center gap-1.5">
          {clean(client.telefono) && (
            <a href={whatsappUrl(client.telefono)} target="_blank" rel="noreferrer" className={btn.icon} aria-label={`WhatsApp a ${alert.cliente}`} title="WhatsApp">
              <MessageCircle className="size-4" aria-hidden="true" />
            </a>
          )}
          <button type="button" disabled={busy} onClick={() => onReminderDone(client)} className={`${btn.secondary} h-9 px-3 text-xs`} aria-label={`Marcar enviado el link a ${alert.cliente}`}>
            <Check className="size-3.5" aria-hidden="true" />
            {busy ? 'Guardando' : 'Enviado'}
          </button>
        </div>
      )}
      {alert.type === 'pago' && client && (
        <button type="button" disabled={busy} onClick={() => onPaid(client)} className={`${btn.secondary} h-9 shrink-0 px-3 text-xs`} aria-label={`Registrar pago de ${alert.cliente}`}>
          <Check className="size-3.5" aria-hidden="true" />
          {busy ? 'Guardando' : 'Pagó'}
        </button>
      )}
    </li>
  )
}

const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_7.5rem] md:items-center md:gap-4'

// Cuánto deja cada cliente por mes: plan menos lo que cuesta su base de Neon (proyección del mes, al dólar tarjeta).
function ProfitSection({ profit, dolar, onOpen }: { profit: { rows: ReturnType<typeof profitByClient>; sinAsignar: NeonProject[]; ganancia: number; costo: number }; dolar: number; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Rentabilidad" className={`${card} mb-6 overflow-hidden`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-paper/60 md:px-5">
        <span>
          <span className="font-display text-lg font-bold tracking-tight">Rentabilidad mensual</span>
          <span className="block text-xs text-muted-ink">Planes menos el costo de Neon proyectado este mes · dólar tarjeta {money(Math.round(dolar))}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-right"><span className="block text-xs text-muted-ink">Ganancia</span><span className="font-display text-xl font-bold text-emerald-700">{money(profit.ganancia)}</span></span>
          <span className="text-right"><span className="block text-xs text-muted-ink">Costo Neon</span><span className="font-semibold text-red-600">{money(profit.costo)}</span></span>
          <ChevronDown className={`size-4 text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="border-t border-line">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-3 bg-paper/60 px-5 py-2 md:grid">
            {['Cliente', 'Cobra por mes', 'Costo Neon', 'Le queda'].map((label) => <div key={label} className="eyebrow text-[10px] text-muted-ink">{label}</div>)}
          </div>
          <ul className="divide-y divide-line">
            {profit.rows.map((row) => (
              <li key={row.key}>
                <button type="button" onClick={() => onOpen(row.key)} className="grid w-full grid-cols-2 gap-x-3 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-paper/60 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:px-5">
                  <span className="col-span-2 truncate font-semibold md:col-span-1">{row.nombre}</span>
                  <span className="text-muted-ink md:text-ink"><span className="md:hidden">Cobra </span>{money(row.ingreso)}</span>
                  <span className="text-muted-ink">{row.bases.length ? <>{money(row.costoArs)} <span className="text-xs">(US$ {row.costoUsd.toFixed(2)})</span></> : 'Sin base asignada'}</span>
                  <span className={`font-semibold ${row.ganancia < 0 ? 'text-red-600' : 'text-emerald-700'}`}><span className="font-normal text-muted-ink md:hidden">Le queda </span>{money(row.ganancia)}</span>
                </button>
              </li>
            ))}
          </ul>
          {profit.sinAsignar.length > 0 && (
            <p className="border-t border-line bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900 md:px-5">
              Bases con gasto sin cliente asignado (la del panel es tuya): {profit.sinAsignar.map((p) => p.name).join(', ')}. Si alguna es de un cliente, asignala en «Editar» → «Base en Neon».
            </p>
          )}
        </div>
      )}
    </section>
  )
}

type SortProps = { scope: string; sortKey: string; placeholder: boolean; onPointerDown: (e: React.PointerEvent<HTMLElement>) => void; onNudge: (direction: -1 | 1) => void }

function DragHandle({ label, onNudge }: { label: string; onNudge: (direction: -1 | 1) => void }) {
  return (
    <button
      type="button"
      data-drag-handle
      aria-label={`Mover ${label}: arrastrar, o flechas arriba y abajo`}
      title="Arrastrá para ordenar"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        onNudge(event.key === 'ArrowUp' ? -1 : 1)
      }}
      className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-ink/30 transition-colors hover:bg-paper hover:text-ink"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  )
}

function TaskBadge({ task, today }: { task?: ClientTask; today: string }) {
  if (!task) return null
  const when = cuando(task.fecha, today)
  return <Badge tone={when.tone}><CalendarClock className="size-3" aria-hidden="true" />{when.text} · <span className="max-w-32 truncate">{task.texto}</span></Badge>
}

type RowProps = {
  client: SheetClient
  sort: SortProps
  task?: ClientTask
  today: string
  busy: boolean
  unsubscribed: boolean
  paidByMp: string
  nested?: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

function ClientRow({ client, busy, unsubscribed, paidByMp, nested, sort, task, today, onOpen, onEdit, onDelete }: RowProps) {
  const name = `${client.nombre} ${client.apellido}`
  return (
    <div
      role="button"
      tabIndex={0}
      data-sort-scope={sort.scope}
      data-sort-key={sort.sortKey}
      onPointerDown={sort.onPointerDown}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen() } }}
      className={`relative cursor-pointer select-none px-4 py-3 transition-colors hover:bg-paper/70 focus:outline-none focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 md:px-5 md:py-3.5 ${nested ? 'bg-white/70 pl-6 md:pl-9' : ''} ${busy ? 'opacity-60' : ''} ${sort.placeholder ? 'opacity-30' : ''} ${rowGrid}`}
    >
      <div className="min-w-0 pr-28 md:pr-0">
        <div className="truncate font-semibold">{name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {clean(client.telefono) ? (
            <a href={whatsappUrl(client.telefono)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-xs text-muted-ink underline-offset-2 hover:text-brand hover:underline">{client.telefono}</a>
          ) : <span className="text-xs text-ink/40">Sin teléfono</span>}
          {unsubscribed && <Badge tone="amber">Falta suscribir</Badge>}
          {unsubscribed && client.avisoSuscripcion && <Badge tone="blue"><Bell className="size-3" aria-hidden="true" />Aviso {formatDate(client.avisoSuscripcion)}</Badge>}
          {paidByMp && <Badge tone="green">MP al día</Badge>}
          <TaskBadge task={task} today={today} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 md:contents">
        <Cell label="Empresa" className="order-1 md:hidden">{clean(client.empresa) || '—'}</Cell>
        <Cell label="Producto" className="order-3 md:hidden">{clean(client.producto) || '—'}</Cell>
        <div className="hidden min-w-0 md:block">
          <div className="truncate text-sm font-medium">{clean(client.empresa) || '—'}</div>
          <div className="truncate text-xs text-muted-ink">{clean(client.producto) || '—'}</div>
        </div>
        <Cell label="Dominio" className="order-5 col-span-2 md:order-none md:col-span-1" extra={client.dominioVencimiento ? `Vence ${formatDate(client.dominioVencimiento)}` : ''}>{clean(client.dominio) || '—'}</Cell>
        <Cell label="Servidor" className="order-4 md:order-none" extra={clean(client.baseDatos) ? `Base: ${client.baseDatos}` : ''}>{clean(client.servidor) || '—'}</Cell>
        <Cell label="Plan" className="order-2 md:order-none" extra={client.proximoPago ? `Próx. ${formatDate(currentDueDate(client.metodoPago, client.proximoPago, paidByMp))}` : ''} strong>{clean(client.plan) || '—'}</Cell>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-1 md:static md:justify-end" onClick={(event) => event.stopPropagation()}>
        <DragHandle label={name} onNudge={sort.onNudge} />
        <button type="button" onClick={onEdit} className={btn.icon} aria-label={`Editar a ${name}`}><Pencil className="size-3.5" /></button>
        <button type="button" onClick={onDelete} disabled={busy} className={btn.danger} aria-label={`Eliminar a ${name}`}><Trash2 className="size-3.5" /></button>
      </div>
    </div>
  )
}

function Cell({ label, children, extra, strong, className = '' }: { label: string; children: React.ReactNode; extra?: string; strong?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink/40 md:hidden">{label}</div>
      <div className={`truncate text-sm ${strong ? 'font-semibold text-brand' : ''}`}>{children}</div>
      {extra && <div className="truncate text-[11px] text-muted-ink">{extra}</div>}
    </div>
  )
}

function GroupRow({ entry, sort, task, today, unsubscribed, expanded, onToggle, onAddService, children }: { entry: ClientEntry; sort: SortProps; task?: ClientTask; today: string; unsubscribed: boolean; expanded: boolean; onToggle: () => void; onAddService: () => void; children: React.ReactNode }) {
  const { members } = entry
  const names = [...new Set(members.map((member) => `${member.nombre} ${member.apellido}`))]
  const products = [...new Set(members.map((member) => clean(member.producto)).filter(Boolean))]
  const totalPlan = members.reduce((total, member) => total + planAmount(member.plan), 0)
  const company = [...new Set(members.map((member) => clean(member.empresa)).filter(Boolean))].join(' · ')
  // Los clientes con varios servicios se distinguen: franja azul a la izquierda y fondo celeste (más intenso abierto).
  return (
    <div data-sort-scope={sort.scope} data-sort-key={sort.sortKey} className={`relative transition-colors ${expanded ? 'bg-brand-light/60' : 'bg-brand-light/25'} ${sort.placeholder ? 'opacity-30' : ''}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 z-10 bg-brand transition-all ${expanded ? 'w-1.5' : 'w-1'}`} />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onPointerDown={sort.onPointerDown}
        onClick={onToggle}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle() } }}
        className={`relative cursor-pointer select-none px-4 py-3 transition-colors hover:bg-paper/70 focus:outline-none focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 md:px-5 md:py-3.5 ${rowGrid}`}
      >
        <div className="min-w-0 pr-28 md:pr-0">
          <div className="truncate font-semibold" title={names.join(', ')}>{names.join(', ')}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="blue" className="!bg-brand !text-white !ring-brand">
              <Layers className="size-3" aria-hidden="true" />
              {members.length} servicios
            </Badge>
            {unsubscribed && <Badge tone="amber">Falta suscribir</Badge>}
            <TaskBadge task={task} today={today} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 md:contents">
          <Cell label="Empresa" extra={products.join(' · ')}>{company}</Cell>
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <Cell label="Plan total" strong>{totalPlan ? money(totalPlan) : '—'}</Cell>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1 md:static md:justify-end" onClick={(event) => event.stopPropagation()}>
          <DragHandle label={company} onNudge={sort.onNudge} />
          <button type="button" onClick={onAddService} aria-label={`Agregar servicio a ${company}`} title="Agregar servicio" className={btn.icon}>
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={onToggle} aria-label={expanded ? `Contraer ${company}` : `Ver servicios de ${company}`} className={`${btn.icon} ${expanded ? '!border-ink !bg-ink !text-white' : ''}`}>
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {expanded && <div className="divide-y divide-brand/10 border-t border-brand/15">{children}</div>}
    </div>
  )
}

// El precio al que se vendió se carga directo en el detalle; el botón aparece cuando hay un cambio sin guardar.
function SaleValue({ value, busy, onSave }: { value: string; busy: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (draft !== value) onSave(draft) }} className="mt-1 flex items-center gap-2 font-normal">
      <div className="min-w-0 flex-1"><MoneyInput label="Valor de venta" placeholder="Anotá el precio" value={draft} onChange={setDraft} /></div>
      {draft !== value && <button type="submit" disabled={busy} className={`${btn.primary} h-11`}>Guardar</button>}
    </form>
  )
}

function ClientDetails({ client, busy, unsubscribed, paidByMp, onClose, onEdit, onAddService, onPaid, onReminder, onDelete, onSaleValue, neonBase, tasks }: { client: SheetClient; busy: boolean; unsubscribed: boolean; paidByMp: string; onClose: () => void; onEdit: () => void; onAddService: () => void; onPaid: () => void; onReminder: (date: string) => void; onDelete: () => void; onSaleValue: (value: string) => void; neonBase: { name: string; usd: number | null } | null; tasks: React.ReactNode }) {
  const groups: { title: string; items: [string, React.ReactNode][] }[] = [
    { title: 'Contacto', items: [['Empresa', clean(client.empresa)], ['Mail', clean(client.mail)], ['Teléfono', clean(client.telefono)]] },
    { title: 'Servicio', items: [['Producto', clean(client.producto)], ['Dominio', clean(client.dominio)], ['Vencimiento del dominio', formatDate(client.dominioVencimiento)], ['Valor de venta', <SaleValue key={client.row} value={client.valorVenta} busy={busy} onSave={onSaleValue} />], ['Servidor', clean(client.servidor)], ['Base de datos', clean(client.baseDatos)], ['Base en Neon', neonBase ? `${neonBase.name}${neonBase.usd !== null ? ` · US$ ${neonBase.usd.toFixed(2)} este mes` : ''}` : '']] },
    { title: 'Cobro', items: [['Plan', clean(client.plan)], ['Método de pago', clean(client.metodoPago)], ['Último pago', formatDate(paidByMp > client.ultimoPago ? paidByMp : client.ultimoPago)], ['Próximo pago', formatDate(currentDueDate(client.metodoPago, client.proximoPago, paidByMp))]] },
  ]
  return (
    <Modal
      eyebrow="Detalle del cliente"
      title={`${client.nombre} ${client.apellido}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onPaid} disabled={busy} className={btn.primary}><Check className="size-4" aria-hidden="true" />Registrar pago de hoy</button>
          <button type="button" onClick={onEdit} className={btn.secondary}><Pencil className="size-4" aria-hidden="true" />Editar</button>
          <button type="button" onClick={onAddService} className={btn.secondary}><Plus className="size-4" aria-hidden="true" />Agregar servicio</button>
          <button type="button" onClick={onDelete} disabled={busy} className={`${btn.secondary} text-red-600 hover:border-red-300 hover:bg-red-50 sm:ml-auto`}><Trash2 className="size-4" aria-hidden="true" />Eliminar</button>
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {clean(client.telefono) && <a href={whatsappUrl(client.telefono)} target="_blank" rel="noreferrer" className={btn.secondary}><MessageCircle className="size-4" aria-hidden="true" />WhatsApp</a>}
        {clean(client.mail) && <a href={`mailto:${client.mail}`} className={btn.secondary}><Mail className="size-4" aria-hidden="true" />Mail</a>}
        {unsubscribed && <Badge tone="amber" className="self-center">Falta suscribir en Mercado Pago</Badge>}
        {paidByMp && <Badge tone="green" className="self-center">Mercado Pago cobró el {formatDate(paidByMp)}</Badge>}
      </div>
      {unsubscribed && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><Bell className="size-4" aria-hidden="true" />Recordarme enviar el link de suscripción</p>
          <p className="mt-1 text-xs text-amber-900/70">Elegí el día y ese día aparece en “Para atender” con un acceso a WhatsApp.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56">
              <DateField ariaLabel="Fecha del aviso de suscripción" placeholder="Elegí el día del aviso" value={client.avisoSuscripcion} onChange={onReminder} />
            </div>
            {client.avisoSuscripcion && (
              <button type="button" disabled={busy} onClick={() => onReminder('')} className={`${btn.secondary} h-10 px-3 text-xs`}>Quitar aviso</button>
            )}
          </div>
        </div>
      )}
      {tasks}
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="eyebrow mb-2 text-[10px] text-muted-ink">{group.title}</p>
            <dl className="grid gap-x-5 gap-y-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
              {group.items.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-ink">{label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <ClientHistory key={client.row} empresa={client.empresa} />
    </Modal>
  )
}
