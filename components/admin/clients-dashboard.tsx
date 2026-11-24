'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, ChevronDown, ChevronUp, CircleDollarSign, Download, Layers, Mail, MessageCircle, Pencil, Plus, RefreshCw, Search, Trash2, UserRound } from 'lucide-react'
import { buildClientAlerts, describeDays, type ClientAlert } from '@/lib/admin/client-alerts'
import { COLUMN_LABELS, fingerprint, type ClientInput, type SheetClient } from '@/lib/admin/clients-shared'
import { nextPaymentDate } from '@/lib/admin/payments'
import { AdminShell, Badge, EmptyState, Modal, PageHeader, Stat, btn, card, inputClass } from '@/components/admin/ui'
import { DateField, SelectField } from '@/components/admin/pickers'

const emptyForm: ClientInput = { nombre: '', apellido: '', empresa: '', producto: '', dominio: '', dominioVencimiento: '', mail: '', telefono: '', servidor: '', baseDatos: '', plan: '', metodoPago: '', ultimoPago: '', proximoPago: '' }
const paymentOptions = ['Débito Automático', 'Pago mensual', 'Pago semestral', 'Pago anual']
const planOptions = ['$10.000', '$15.000', '$20.000', '$30.000', '$40.000', '$50.000']
const CUSTOM_PLAN = '__personalizado'
const isCustomPlan = (plan: string) => !!plan && !planOptions.includes(plan)
// Lo que se escribe en "Monto personalizado" se guarda con el mismo formato que los planes fijos: $12.500.
const formatPlan = (digits: string) => (digits ? `$${Number(digits).toLocaleString('es-AR')}` : '')

// Secciones de la ficha: qué campos van juntos y cuáles son obligatorios.
const formSections: { title: string; fields: (keyof ClientInput)[] }[] = [
  { title: 'Contacto', fields: ['nombre', 'apellido', 'empresa', 'mail', 'telefono'] },
  { title: 'Servicio', fields: ['producto', 'dominio', 'dominioVencimiento', 'servidor', 'baseDatos'] },
  { title: 'Cobro', fields: ['plan', 'metodoPago', 'ultimoPago'] },
]
const requiredFields = new Set<keyof ClientInput>(['nombre', 'apellido', 'plan', 'metodoPago', 'ultimoPago'])

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

function buildEntries(list: SheetClient[]): ClientEntry[] {
  const entries = new Map<string, ClientEntry>()
  for (const client of list) {
    const company = normalizeText(clean(client.empresa))
    const key = company ? `empresa:${company}` : `fila:${client.row}`
    const entry = entries.get(key)
    if (entry) entry.members.push(client)
    else entries.set(key, { key, members: [client] })
  }
  return [...entries.values()]
}

const planAmount = (plan: string) => Number.parseInt(plan.replace(/[^0-9]/g, ''), 10) || 0
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
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [mpPaid, setMpPaid] = useState<Record<string, string>>({})
  const [mpSubs, setMpSubs] = useState<Set<string> | null>(null)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
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
  }, [load, loadMercadoPago])

  const refresh = () => { load(); loadMercadoPago() }

  const plans = useMemo(() => [...new Set(clients.map((client) => clean(client.plan)).filter(Boolean))].sort((a, b) => planAmount(a) - planAmount(b)), [clients])
  const servers = useMemo(() => [...new Set(clients.map((client) => clean(client.servidor)).filter(Boolean))].sort(), [clients])
  const activeProducts = useMemo(() => clients.filter((client) => clean(client.producto)).length, [clients])
  const monthlyRevenue = useMemo(() => clients.reduce((total, client) => total + planAmount(client.plan), 0), [clients])
  const nextExpiringDomain = useMemo(() => {
    const today = todayIso()
    return clients.filter((client) => client.dominioVencimiento && client.dominioVencimiento >= today).sort((a, b) => a.dominioVencimiento.localeCompare(b.dominioVencimiento))[0] ?? null
  }, [clients])
  const alerts = useMemo(() => buildClientAlerts(clients, new Date(), mpPaid), [clients, mpPaid])
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
  const isFiltering = query.trim() !== '' || plan !== 'all' || servidor !== 'all'
  // Cliente con plan que todavía no tiene suscripción en Mercado Pago (solo si la consulta respondió).
  const needsSubscription = (client: SheetClient) => !!mpSubs && !!clean(client.plan) && !mpSubs.has(client.empresa)
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

  function update(field: keyof ClientInput, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'metodoPago' || field === 'ultimoPago') next.proximoPago = nextPaymentDate(next.metodoPago, next.ultimoPago)
      return next
    })
  }

  async function send(method: 'POST' | 'PUT' | 'DELETE' | 'PATCH', body: unknown) {
    const response = await fetch('/api/administracion/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status === 401) { router.replace('/administracion/login'); throw new Error('La sesión expiró') }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar')
    return result
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    // Los selectores propios no usan la validación nativa: se revisan acá los obligatorios.
    const missing = [...requiredFields].filter((field) => !form[field].trim()).map((field) => (field === 'ultimoPago' ? 'Fecha del último pago' : COLUMN_LABELS[field]))
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

  async function markPaid(client: SheetClient) {
    const today = todayIso()
    const next = nextPaymentDate(client.metodoPago, today)
    if (!window.confirm(`¿Registrar el pago de ${clean(client.empresa) || `${client.nombre} ${client.apellido}`} con fecha de hoy?${next ? ` El próximo pago queda para el ${formatDate(next)}.` : ''}`)) return
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

  async function persistOrder(reordered: SheetClient[]) {
    const previous = clients
    setClients(reordered)
    try {
      await send('PATCH', { ids: reordered.map((item) => item.row) })
    } catch (e) {
      setClients(previous)
      notify(e instanceof Error ? e.message : 'No se pudo guardar el orden', 'error')
    }
  }

  async function moveEntry(key: string, direction: -1 | 1) {
    const visibleIndex = visibleEntries.findIndex((entry) => entry.key === key)
    const target = visibleEntries[visibleIndex + direction]
    if (visibleIndex < 0 || !target) return
    const entries = buildEntries(clients)
    const from = entries.findIndex((entry) => entry.key === key)
    const to = entries.findIndex((entry) => entry.key === target.key)
    if (from < 0 || to < 0) return
    ;[entries[from], entries[to]] = [entries[to], entries[from]]
    await persistOrder(entries.flatMap((entry) => entry.members))
  }

  async function moveWithinGroup(entry: ClientEntry, client: SheetClient, direction: -1 | 1) {
    const sibling = entry.members[entry.members.findIndex((member) => member.row === client.row) + direction]
    if (!sibling) return
    const reordered = [...clients]
    const from = reordered.findIndex((item) => item.row === client.row)
    const to = reordered.findIndex((item) => item.row === sibling.row)
    if (from < 0 || to < 0) return
    ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
    await persistOrder(reordered)
  }

  async function remove(client: SheetClient) {
    // Si la empresa tiene otros servicios, se borra solo este servicio y el cliente sigue.
    const isService = !!clean(client.empresa) && clients.some((other) => other.row !== client.row && other.empresa === client.empresa)
    const question = isService
      ? `¿Eliminar el servicio "${clean(client.producto) || 'sin producto'}" de ${client.empresa}? Los demás servicios quedan. No se puede deshacer.`
      : `¿Eliminar a ${client.nombre} ${client.apellido}${clean(client.empresa) ? ` (${client.empresa})` : ''}? No se puede deshacer.`
    if (!window.confirm(question)) return
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
    paidByMp: mpPaid[client.empresa] ?? '',
    onOpen: () => setSelectedClient(client),
    onEdit: () => openEdit(client),
    onDelete: () => remove(client),
  })

  return (
    <AdminShell>
      <PageHeader eyebrow="Cartera" title="Clientes" description="Servicios contratados, dominios y cobros de cada cliente.">
        <button type="button" onClick={refresh} disabled={loading} className={btn.secondary}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Actualizando' : 'Actualizar'}
        </button>
        <a href="/api/administracion/clients/export" download className={btn.secondary}>
          <Download className="size-4" aria-hidden="true" />
          Exportar CSV
        </a>
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
            <div key={label} className="eyebrow text-[10px] text-muted-ink">{label}</div>
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
            visibleEntries.map((entry, entryIndex) => {
              const order = { canMoveUp: entryIndex > 0, canMoveDown: entryIndex < visibleEntries.length - 1, onMoveUp: () => moveEntry(entry.key, -1), onMoveDown: () => moveEntry(entry.key, 1) }
              if (entry.members.length === 1) return <ClientRow key={entry.key} {...rowProps(entry.members[0])} {...order} />
              return (
                <GroupRow key={entry.key} entry={entry} unsubscribed={needsSubscription(entry.members[0])} expanded={isFiltering || expandedGroups.has(entry.key)} onToggle={() => toggleGroup(entry.key)} onAddService={() => openNew(entry.members[0])} {...order}>
                  {entry.members.map((client, memberIndex) => (
                    <ClientRow
                      key={client.row}
                      {...rowProps(client)}
                      nested
                      canMoveUp={memberIndex > 0}
                      canMoveDown={memberIndex < entry.members.length - 1}
                      onMoveUp={() => moveWithinGroup(entry, client, -1)}
                      onMoveDown={() => moveWithinGroup(entry, client, 1)}
                    />
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
          paidByMp={mpPaid[selectedClient.empresa] ?? ''}
          onClose={closeDetails}
          onEdit={() => openEdit(selectedClient)}
          onAddService={() => openNew(selectedClient)}
          onPaid={() => markPaid(selectedClient)}
          onDelete={() => remove(selectedClient)}
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
            {formSections.map((section) => (
              <fieldset key={section.title}>
                <legend className="eyebrow mb-3 text-[10px] text-muted-ink">{section.title}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.fields.map((field) => (
                    <div key={field} className="text-xs font-semibold text-ink/70">
                      {field === 'ultimoPago' ? 'Fecha del último pago' : COLUMN_LABELS[field]}
                      {requiredFields.has(field) && <span className="text-orange-600"> *</span>}
                      <div className="mt-1.5">
                        {field === 'plan' ? (
                          <div className="grid gap-2">
                            <SelectField
                              ariaLabel="Plan"
                              placeholder="Elegí un plan"
                              value={customPlan ? CUSTOM_PLAN : form.plan}
                              onChange={(value) => {
                                const custom = value === CUSTOM_PLAN
                                setCustomPlan(custom)
                                update('plan', custom ? (isCustomPlan(form.plan) ? form.plan : '') : value)
                              }}
                              options={[...planOptions, { value: CUSTOM_PLAN, label: 'Monto personalizado…' }]}
                            />
                            {customPlan && (
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">$</span>
                                <input
                                  aria-label="Monto personalizado del plan"
                                  inputMode="numeric"
                                  autoFocus
                                  placeholder="Ej.: 12.500"
                                  value={form.plan.replace(/[^0-9]/g, '') ? Number(form.plan.replace(/[^0-9]/g, '')).toLocaleString('es-AR') : ''}
                                  onChange={(e) => update('plan', formatPlan(e.target.value.replace(/[^0-9]/g, '').slice(0, 9)))}
                                  className={`${inputClass} pl-7`}
                                />
                              </div>
                            )}
                          </div>
                        ) : field === 'metodoPago' ? (
                          <SelectField ariaLabel="Método de pago" placeholder="Elegí un método" value={form.metodoPago} onChange={(value) => update('metodoPago', value)} options={[...new Set([...paymentOptions, ...(form.metodoPago ? [form.metodoPago] : [])])]} />
                        ) : field === 'dominioVencimiento' || field === 'ultimoPago' ? (
                          <DateField ariaLabel={field === 'ultimoPago' ? 'Fecha del último pago' : 'Vencimiento del dominio'} value={form[field]} onChange={(value) => update(field, value)} />
                        ) : (
                          <input
                            aria-label={COLUMN_LABELS[field]}
                            type={field === 'mail' ? 'email' : field === 'telefono' ? 'tel' : 'text'}
                            autoComplete="off"
                            value={form[field]}
                            onChange={(e) => update(field, e.target.value)}
                            className={inputClass}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {section.title === 'Cobro' && (
                    <div className="text-xs font-semibold text-ink/70">
                      Próximo pago
                      <div className="mt-1.5 flex h-11 items-center rounded-xl border border-dashed border-line bg-paper px-3 text-sm font-normal text-ink">
                        {form.proximoPago ? formatDate(form.proximoPago) : <span className="text-ink/40">Se calcula con el método y la fecha</span>}
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>
            ))}
            {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          </form>
        </Modal>
      )}

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

function AlertItem({ alert, client, showService, unsubscribed, busy, onPaid, onOpen }: { alert: ClientAlert; client?: SheetClient; showService: boolean; unsubscribed: boolean; busy: boolean; onPaid: (client: SheetClient) => void; onOpen: (client: SheetClient) => void }) {
  return (
    <li className="flex items-center justify-between gap-3 bg-white px-4 py-3 md:px-5">
      <button type="button" onClick={() => client && onOpen(client)} className="min-w-0 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{alert.cliente}{showService && client && clean(client.producto) && <span className="font-normal text-muted-ink"> · {client.producto}</span>}</span>
          <Badge tone={alert.days < 0 ? 'red' : 'orange'}>{describeDays(alert.days)}</Badge>
          {unsubscribed && <Badge tone="amber">Falta suscribir</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-ink">
          {alert.type === 'dominio' ? 'Dominio' : 'Pago'} · {alert.detalle} · {formatDate(alert.date)}
        </span>
      </button>
      {alert.type === 'pago' && client && (
        <button type="button" disabled={busy} onClick={() => onPaid(client)} className={`${btn.secondary} h-9 shrink-0 px-3 text-xs`} aria-label={`Registrar pago de ${alert.cliente}`}>
          <Check className="size-3.5" aria-hidden="true" />
          {busy ? 'Guardando' : 'Pagó'}
        </button>
      )}
    </li>
  )
}

const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_7.5rem] md:items-center md:gap-4'

function OrderButtons({ label, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: { label: string; canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <div className="flex flex-col">
      <button type="button" aria-label={`Subir ${label}`} disabled={!canMoveUp} onClick={onMoveUp} className="rounded p-0.5 text-ink/40 hover:bg-paper hover:text-ink disabled:opacity-20"><ChevronUp className="size-3.5" /></button>
      <button type="button" aria-label={`Bajar ${label}`} disabled={!canMoveDown} onClick={onMoveDown} className="rounded p-0.5 text-ink/40 hover:bg-paper hover:text-ink disabled:opacity-20"><ChevronDown className="size-3.5" /></button>
    </div>
  )
}

type RowProps = {
  client: SheetClient
  busy: boolean
  unsubscribed: boolean
  paidByMp: string
  nested?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

function ClientRow({ client, busy, unsubscribed, paidByMp, nested, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onOpen, onEdit, onDelete }: RowProps) {
  const name = `${client.nombre} ${client.apellido}`
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen() } }}
      className={`relative cursor-pointer px-4 py-3 transition-colors hover:bg-paper/70 focus:outline-none focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 md:px-5 md:py-3.5 ${nested ? 'bg-paper/40 md:pl-9' : ''} ${busy ? 'opacity-60' : ''} ${rowGrid}`}
    >
      <div className="min-w-0 pr-28 md:pr-0">
        <div className="truncate font-semibold">{name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {clean(client.telefono) ? (
            <a href={whatsappUrl(client.telefono)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-xs text-muted-ink underline-offset-2 hover:text-brand hover:underline">{client.telefono}</a>
          ) : <span className="text-xs text-ink/40">Sin teléfono</span>}
          {unsubscribed && <Badge tone="amber">Falta suscribir</Badge>}
          {paidByMp && <Badge tone="green">MP al día</Badge>}
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
        <Cell label="Plan" className="order-2 md:order-none" extra={client.proximoPago ? `Próx. ${formatDate(client.proximoPago)}` : ''} strong>{clean(client.plan) || '—'}</Cell>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-1 md:static md:justify-end" onClick={(event) => event.stopPropagation()}>
        <OrderButtons label={name} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
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

function GroupRow({ entry, unsubscribed, expanded, canMoveUp, canMoveDown, onToggle, onAddService, onMoveUp, onMoveDown, children }: { entry: ClientEntry; unsubscribed: boolean; expanded: boolean; canMoveUp: boolean; canMoveDown: boolean; onToggle: () => void; onAddService: () => void; onMoveUp: () => void; onMoveDown: () => void; children: React.ReactNode }) {
  const { members } = entry
  const names = [...new Set(members.map((member) => `${member.nombre} ${member.apellido}`))]
  const products = [...new Set(members.map((member) => clean(member.producto)).filter(Boolean))]
  const totalPlan = members.reduce((total, member) => total + planAmount(member.plan), 0)
  const company = members[0].empresa
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle() } }}
        className={`relative cursor-pointer px-4 py-3 transition-colors hover:bg-paper/70 focus:outline-none focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 md:px-5 md:py-3.5 ${rowGrid}`}
      >
        <div className="min-w-0 pr-28 md:pr-0">
          <div className="truncate font-semibold" title={names.join(', ')}>{names.join(', ')}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="blue">{members.length} servicios</Badge>
            {unsubscribed && <Badge tone="amber">Falta suscribir</Badge>}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 md:contents">
          <Cell label="Empresa" extra={products.join(' · ')}>{company}</Cell>
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <Cell label="Plan total" strong>{totalPlan ? money(totalPlan) : '—'}</Cell>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1 md:static md:justify-end" onClick={(event) => event.stopPropagation()}>
          <OrderButtons label={company} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
          <button type="button" onClick={onAddService} aria-label={`Agregar servicio a ${company}`} title="Agregar servicio" className={btn.icon}>
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={onToggle} aria-label={expanded ? `Contraer ${company}` : `Ver servicios de ${company}`} className={btn.icon}>
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {expanded && <div className="divide-y divide-line border-t border-line">{children}</div>}
    </div>
  )
}

function ClientDetails({ client, busy, unsubscribed, paidByMp, onClose, onEdit, onAddService, onPaid, onDelete }: { client: SheetClient; busy: boolean; unsubscribed: boolean; paidByMp: string; onClose: () => void; onEdit: () => void; onAddService: () => void; onPaid: () => void; onDelete: () => void }) {
  const groups: { title: string; items: [string, string][] }[] = [
    { title: 'Contacto', items: [['Empresa', clean(client.empresa)], ['Mail', clean(client.mail)], ['Teléfono', clean(client.telefono)]] },
    { title: 'Servicio', items: [['Producto', clean(client.producto)], ['Dominio', clean(client.dominio)], ['Vencimiento del dominio', formatDate(client.dominioVencimiento)], ['Servidor', clean(client.servidor)], ['Base de datos', clean(client.baseDatos)]] },
    { title: 'Cobro', items: [['Plan', clean(client.plan)], ['Método de pago', clean(client.metodoPago)], ['Último pago', formatDate(client.ultimoPago)], ['Próximo pago', formatDate(client.proximoPago)]] },
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
    </Modal>
  )
}
