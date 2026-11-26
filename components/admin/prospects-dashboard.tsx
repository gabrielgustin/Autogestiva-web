'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Ban, CalendarClock, Check, ChevronRight, Copy, ExternalLink, Flame, Globe, Instagram, LayoutGrid, List, Mail, MessageCircle, MonitorSmartphone, MoreHorizontal, PauseCircle, Phone, Plus, Search, Send, Sparkles, StickyNote, Trash2, Trophy, Undo2, UserRound, X } from 'lucide-react'
import { AdminShell, Badge, EmptyState, Modal, PageHeader, Stat, btn, card, inputClass, useConfirm } from '@/components/admin/ui'
import { EN_CURSO, ESTADOS, ESTADO_TONE, PRODUCTOS, daysBetween, isoIn, mensajeSeguimiento, nombreEstado, normalizeText, phoneDigits, primerMensaje, waLink, type Estado, type Prospect, type ProspectEvent } from '@/lib/admin/prospects'

// Sección Prospectos del panel: agenda del día, embudo por estado, banco de prospectos y ficha con WhatsApp e historial.
type Toast = { message: string; tone: 'ok' | 'error' }
type Patch = Partial<Omit<Prospect, 'id' | 'origen' | 'creado'>>
type Evento = { tipo: string; texto?: string }

const PAGE = 50
const CERRADOS: Estado[] = ['Cliente', 'Rechazado', 'En pausa']
const SIN_CONTACTO: Estado[] = ['Prospecto', 'Hacer demo', 'Demo lista']
const MEDIOS = [
  { tipo: 'WhatsApp', icon: MessageCircle },
  { tipo: 'Llamada', icon: Phone },
  { tipo: 'Mail', icon: Mail },
  { tipo: 'Visita', icon: UserRound },
  { tipo: 'Nota', icon: StickyNote },
]
// Tipos de próximo paso: una reunión o un presupuesto se agendan acá, no son columnas del embudo.
const PASOS = ['Recontactar', 'Reunión', 'Enviar presupuesto']
const PLAZOS = [
  { label: 'Mañana', days: 1 },
  { label: '3 días', days: 3 },
  { label: '1 semana', days: 7 },
  { label: '2 semanas', days: 14 },
]

const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^@/, 'instagram.com/')}`)
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

// Etiqueta de una fecha de próximo paso respecto de hoy: atrasado en rojo, hoy en naranja.
function cuando(iso: string, today: string): { text: string; tone: 'red' | 'orange' | 'blue' | 'gray' } {
  const d = daysBetween(today, iso)
  if (d < 0) return { text: d === -1 ? 'Ayer' : `Atrasado ${-d} días`, tone: 'red' }
  if (d === 0) return { text: 'Hoy', tone: 'orange' }
  if (d === 1) return { text: 'Mañana', tone: 'blue' }
  return { text: fmtDay(iso), tone: 'gray' }
}

export function ProspectsDashboard() {
  const router = useRouter()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [tab, setTab] = useState<'embudo' | 'banco'>('embudo')
  const [query, setQuery] = useState('')
  const [producto, setProducto] = useState('todos')
  const [estado, setEstado] = useState<string>('Prospecto')
  const [soloWa, setSoloWa] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragging, setDragging] = useState<{ id: string; width: number } | null>(null)
  const [overCol, setOverCol] = useState<Estado | null>(null)
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null)
  const menuId = menu?.id ?? null
  const board = useRef<HTMLDivElement>(null)
  const headRow = useRef<HTMLDivElement>(null)
  // Alto del encabezado del panel (fijo arriba): los títulos de las columnas se pegan justo debajo.
  const [shellTop, setShellTop] = useState(0)
  useEffect(() => {
    const measure = () => setShellTop((document.querySelector('header.sticky') as HTMLElement | null)?.offsetHeight ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const today = isoIn(0)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'ok') => setToast({ message, tone }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json' } })
    if (response.status === 401) {
      router.replace('/administracion/login')
      throw new Error('La sesión venció')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Algo salió mal')
    return data
  }, [router])

  useEffect(() => {
    api('/api/administracion/prospects')
      .then(setProspects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [api])

  const save = useCallback(async (id: string, patch: Patch, evento?: Evento) => {
    // Volver a «Por contactar» lo saca de la agenda: ya no hay un paso pendiente.
    const cambios = patch.estado === 'Prospecto' ? { ...patch, proximoPaso: '', proximoFecha: '' } : patch
    const updated: Prospect = await api('/api/administracion/prospects', { method: 'PUT', body: JSON.stringify({ id, ...cambios, evento }) })
    setProspects((list) => list.map((p) => (p.id === id ? updated : p)))
    return updated
  }, [api])

  async function move(id: string, to: Estado) {
    const current = prospects.find((p) => p.id === id)
    if (!current || current.estado === to) return
    setProspects((list) => list.map((p) => (p.id === id ? { ...p, estado: to } : p)))
    try {
      await save(id, { estado: to })
      notify(`${current.negocio} pasó a «${nombreEstado(to)}»`)
    } catch (e) {
      setProspects((list) => list.map((p) => (p.id === id ? current : p)))
      notify(e instanceof Error ? e.message : 'No se pudo mover', 'error')
    }
  }

  async function quick(id: string, patch: Patch, evento: Evento | undefined, ok: string) {
    try {
      await save(id, patch, evento)
      notify(ok)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    }
  }

  // Arrastre propio (puntero: mouse, lápiz o dedo) en lugar del drag & drop nativo, que no desplaza bien el tablero:
  // una copia de la tarjeta sigue al puntero y, cerca de los bordes, el tablero y la columna se desplazan solos.
  const drag = useRef<{ id: string; x0: number; y0: number; x: number; y: number; dx: number; dy: number; width: number; active: boolean; touch: boolean; timer?: number } | null>(null)
  const dragMoved = useRef(false)
  const ghost = useRef<HTMLDivElement>(null)
  const moveRef = useRef(move)
  moveRef.current = move

  function startDrag(e: React.PointerEvent<HTMLDivElement>, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const d = { id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, width: rect.width, active: false, touch: e.pointerType === 'touch' }
    drag.current = d
    dragMoved.current = false
    // Con el dedo hay que mantener apretado un instante: así deslizar sigue sirviendo para desplazarse.
    if (d.touch) (d as { timer?: number }).timer = window.setTimeout(() => activate(), 280)
  }

  const activate = useCallback(() => {
    const d = drag.current
    if (!d || d.active) return
    d.active = true
    dragMoved.current = true
    setMenu(null)
    setDragging({ id: d.id, width: d.width })
    navigator.vibrate?.(12)
  }, [])

  useEffect(() => {
    let raf = 0
    const colAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null)?.dataset.col as Estado | undefined
    const place = () => {
      const d = drag.current
      if (d && ghost.current) ghost.current.style.transform = `translate3d(${d.x - d.dx}px, ${d.y - d.dy}px, 0) rotate(2deg)`
    }
    // Velocidad que crece cuanto más cerca del borde está el puntero.
    const speed = (depth: number, zone: number) => Math.round(Math.min(1, depth / zone) ** 2 * 26) + 2
    const tick = () => {
      const d = drag.current
      if (!d?.active) return
      const el = board.current
      if (el) {
        const r = el.getBoundingClientRect()
        const zone = Math.min(140, r.width / 4)
        if (d.x < r.left + zone) el.scrollLeft -= speed(r.left + zone - d.x, zone)
        else if (d.x > r.right - zone) el.scrollLeft += speed(d.x - (r.right - zone), zone)
      }
      // Vertical: se desplaza la página (debajo de los títulos fijos) cerca del borde superior o inferior.
      const topEdge = headRow.current?.getBoundingClientRect().bottom ?? 0
      const zoneY = 90
      if (d.y < topEdge + zoneY) window.scrollBy({ top: -speed(topEdge + zoneY - d.y, zoneY), behavior: 'instant' })
      // Sobre la barra «devolver a Por contactar» la página no se mueve.
      else if (d.y > window.innerHeight - zoneY && colAt(d.x, d.y) !== 'Prospecto') window.scrollBy({ top: speed(d.y - (window.innerHeight - zoneY), zoneY), behavior: 'instant' })
      setOverCol(colAt(d.x, d.y) ?? null)
      place()
      raf = requestAnimationFrame(tick)
    }
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      // Si se soltó el botón fuera de la ventana, al volver se termina el arrastre.
      if (d.active && !d.touch && e.buttons === 0) return onEnd(e)
      d.x = e.clientX
      d.y = e.clientY
      if (!d.active) {
        if (Math.hypot(d.x - d.x0, d.y - d.y0) < 6) return
        // Con el dedo, moverse antes de tiempo es desplazarse, no arrastrar.
        if (d.touch) { window.clearTimeout(d.timer); drag.current = null; return }
        activate()
      }
      if (!raf) raf = requestAnimationFrame(tick)
      place()
    }
    const onEnd = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      cancelAnimationFrame(raf)
      raf = 0
      if (!d) return
      window.clearTimeout(d.timer)
      if (!d.active) return
      const col = e.type === 'pointerup' ? colAt(d.x, d.y) : undefined
      setDragging(null)
      setOverCol(null)
      if (col) moveRef.current(d.id, col)
      // El click que sigue al soltar no debe abrir la ficha.
      window.setTimeout(() => { dragMoved.current = false }, 0)
    }
    const onTouchMove = (e: TouchEvent) => { if (drag.current?.active) e.preventDefault() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current?.active) onEnd(new PointerEvent('pointercancel')) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [activate])

  const agenda = useMemo(
    () => prospects.filter((p) => p.proximoFecha && p.proximoFecha <= today && !CERRADOS.includes(p.estado)).sort((a, b) => a.proximoFecha.localeCompare(b.proximoFecha)),
    [prospects, today],
  )
  const counts = useMemo(() => {
    const by = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>
    for (const p of prospects) by[p.estado]++
    const trabajados = prospects.length - by.Prospecto - by['Demo lista']
    return { by, enCurso: EN_CURSO.reduce((n, e) => n + by[e], 0), tasa: trabajados ? Math.round((by.Cliente / trabajados) * 100) : 0 }
  }, [prospects])
  const columns = useMemo(
    () => ESTADOS.filter((e) => e !== 'Prospecto').map((col) => ({ col, items: prospects.filter((p) => p.estado === col).sort((a, b) => (a.proximoFecha || '9999').localeCompare(b.proximoFecha || '9999')) })),
    [prospects],
  )
  const productos = useMemo(() => PRODUCTOS.filter((name) => prospects.some((p) => p.producto === name)), [prospects])
  const banco = useMemo(() => {
    const needle = normalizeText(query.trim())
    return prospects
      .filter((p) => (estado === 'todos' || p.estado === estado) && (producto === 'todos' || p.producto === producto) && (!soloWa || waLink(p.whatsapp)))
      .filter((p) => !needle || normalizeText(`${p.negocio} ${p.rubro} ${p.ciudad} ${p.web} ${p.contacto} ${p.whatsapp}`).includes(needle))
      .sort((a, b) => Number(!waLink(a.whatsapp)) - Number(!waLink(b.whatsapp)) || Number(!a.motivo) - Number(!b.motivo) || a.negocio.localeCompare(b.negocio, 'es'))
  }, [prospects, query, estado, producto, soloWa])
  useEffect(() => setLimit(PAGE), [query, estado, producto, soloWa])

  const open = prospects.find((p) => p.id === openId) ?? null

  return (
    <AdminShell>
      <PageHeader eyebrow="Ventas" title="Prospectos" description="Del primer mensaje al cliente: a quién escribirle hoy, en qué quedó cada demo y qué sigue con cada negocio.">
        <button type="button" className={btn.accent} onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nuevo prospecto
        </button>
      </PageHeader>

      {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Para hoy" value={loading ? '…' : agenda.length} detail={agenda.length ? 'Seguimientos que tocan o se atrasaron' : 'Nada pendiente'} icon={<CalendarClock />} />
        <Stat label="Demos para enviar" value={loading ? '…' : counts.by['Demo lista']} detail={`Listas para mandar · ${counts.by['Hacer demo']} por hacer`} icon={<Send />} />
        <Stat label="En conversación" value={loading ? '…' : counts.enCurso} detail={`${counts.by.Interesado} interesados`} icon={<Flame />} />
        <Stat label="Clientes ganados" value={loading ? '…' : counts.by.Cliente} detail={`${counts.tasa}% de los contactados`} icon={<Trophy />} />
      </div>

      {agenda.length > 0 && (
        <section className={`${card} mt-6 overflow-hidden`} aria-labelledby="agenda-title">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
            <h2 id="agenda-title" className="font-display text-lg font-bold tracking-tight">Agenda de hoy</h2>
            <span className="text-xs text-muted-ink">{fmtDay(today)}</span>
          </div>
          <ul className="divide-y divide-line">
            {agenda.map((p) => {
              const when = cuando(p.proximoFecha, today)
              return (
                <li key={p.id} className="flex items-center">
                  <button type="button" onClick={() => setOpenId(p.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors hover:bg-paper md:pl-5">
                    <Badge tone={when.tone} className="w-[92px] justify-center">{when.text}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.negocio}</span>
                      <span className="block truncate text-xs text-muted-ink">{p.proximoPaso || 'Seguimiento'} · {p.estado}</span>
                    </span>
                    {waLink(p.whatsapp) && <MessageCircle className="size-4 shrink-0 text-emerald-600" aria-label="Tiene WhatsApp" />}
                    <ChevronRight className="size-4 shrink-0 text-ink/30" />
                  </button>
                  {/* Hecho: el paso se cumplió, queda en el historial y sale de la agenda. */}
                  <button type="button" onClick={() => quick(p.id, { proximoPaso: '', proximoFecha: '' }, { tipo: 'Hecho', texto: p.proximoPaso || 'Seguimiento' }, `${p.negocio}: hecho, salió de la agenda`)} className="mx-3 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 md:mx-5">
                    <Check className="size-4" /> Hecho
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Vista" className="flex gap-1 rounded-full border border-line bg-white p-1">
          {([['embudo', 'Embudo', LayoutGrid, prospects.length - counts.by.Prospecto], ['banco', 'Por contactar', List, counts.by.Prospecto]] as const).map(([id, label, Icon, n]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === id ? 'bg-ink text-white' : 'text-ink/70 hover:bg-paper hover:text-ink'}`}>
              <Icon className="size-4" /> {label} <span className={`text-xs ${tab === id ? 'text-white/60' : 'text-muted-ink'}`}>{n}</span>
            </button>
          ))}
        </div>
        {tab === 'embudo' && <p className="hidden text-xs text-muted-ink md:block">Arrastrá una tarjeta a otra columna; cerca de los bordes el tablero se desplaza solo.</p>}
      </div>

      {loading ? (
        <div className={`${card} mt-4`}><EmptyState>Cargando prospectos…</EmptyState></div>
      ) : tab === 'embudo' ? (
        <>
        {/* Títulos de las columnas: se pegan arriba al bajar y siguen el desplazamiento horizontal del tablero. */}
        <div ref={headRow} style={{ top: shellTop }} onWheel={(e) => { if (board.current && e.deltaX) board.current.scrollLeft += e.deltaX }} className="sticky z-20 -mx-4 mt-4 overflow-hidden border-y border-line/70 bg-paper/85 backdrop-blur-md md:-mx-8">
          <div className="flex w-max gap-3 px-4 py-2 md:px-8">
            {columns.map(({ col, items }) => (
              <div key={col} className={`flex w-[280px] shrink-0 items-center justify-between rounded-xl border px-3 py-2 transition-colors ${overCol === col && dragging ? 'border-brand bg-brand-light' : 'border-line bg-white'}`}>
                <Badge tone={ESTADO_TONE[col]}>{col}</Badge>
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted-ink">{items.length}</span>
              </div>
            ))}
          </div>
        </div>
        <div ref={board} onScroll={() => { if (headRow.current && board.current) headRow.current.scrollLeft = board.current.scrollLeft }} className={`-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8 ${dragging ? 'cursor-grabbing select-none' : 'snap-x'}`}>
          {columns.map(({ col, items }) => {
            const isOver = overCol === col && dragging && prospects.find((p) => p.id === dragging.id)?.estado !== col
            return (
              <section
                key={col}
                aria-label={col}
                data-col={col}
                className={`flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border transition-colors duration-150 ${isOver ? 'border-brand bg-brand-light/70 ring-4 ring-brand/15' : 'border-line bg-white/60'} ${col === 'Rechazado' || col === 'En pausa' ? 'opacity-80' : ''}`}
              >
                <div className={`flex min-h-32 flex-1 flex-col p-2 ${col === 'Rechazado' ? 'gap-1' : 'gap-2'}`}>
                  {items.map((p) => {
                    const when = p.proximoFecha ? cuando(p.proximoFecha, today) : null
                    // En «Rechazado» la tarjeta es una sola línea: ahí importa ver muchas, no el detalle.
                    const compacta = col === 'Rechazado'
                    return (
                      <div
                        key={p.id}
                        onPointerDown={(e) => startDrag(e, p.id)}
                        className={`relative shrink-0 select-none rounded-xl border border-line bg-white shadow-[0_1px_0_rgba(11,19,34,0.04)] transition hover:border-ink/25 hover:shadow-[0_12px_30px_-18px_rgba(11,19,34,0.35)] ${dragging ? '' : 'cursor-grab'} ${dragging?.id === p.id ? 'border-dashed border-ink/25 opacity-35 shadow-none' : ''}`}
                      >
                        <button type="button" title={compacta ? p.negocio : undefined} onClick={() => { if (!dragMoved.current) setOpenId(p.id) }} className={`block w-full cursor-[inherit] text-left ${compacta ? 'py-1.5 pl-2.5 pr-9' : 'p-3 pr-9'}`}>
                          {compacta ? <span className="block truncate text-[13px] font-medium">{p.negocio}</span> : <CardBody p={p} when={when} today={today} />}
                        </button>
                        <button type="button" data-no-drag aria-label={`Opciones de ${p.negocio}`} aria-haspopup="menu" aria-expanded={menuId === p.id} onClick={(e) => setMenu(menuId === p.id ? null : { id: p.id, anchor: e.currentTarget.getBoundingClientRect() })} className={`absolute right-1.5 inline-flex items-center justify-center rounded-full text-ink/40 transition-colors hover:bg-paper hover:text-ink ${compacta ? 'top-1 size-6' : 'top-1.5 size-7'}`}>
                          <MoreHorizontal className="size-4" />
                        </button>
                        {menu?.id === p.id && <CardMenu p={p} anchor={menu.anchor} today={today} onClose={() => setMenu(null)} onOpen={() => { setMenu(null); setOpenId(p.id) }} onAction={(patch, evento, ok) => quick(p.id, patch, evento, ok)} notify={notify} />}
                      </div>
                    )
                  })}
                  {items.length === 0 && <p className="px-2 py-8 text-center text-xs text-ink/35">Soltá una tarjeta acá</p>}
                </div>
              </section>
            )
          })}
        </div>
        </>
      ) : (
        <section className={`${card} mt-4 overflow-hidden`}>
          <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:items-center md:p-4">
            <label className="relative flex-1">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar negocio, rubro, web o teléfono" className={`${inputClass} pl-9`} />
            </label>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <select aria-label="Producto" value={producto} onChange={(e) => setProducto(e.target.value)} className={`${inputClass} md:w-44`}>
                <option value="todos">Todos los productos</option>
                {productos.map((name) => <option key={name}>{name}</option>)}
              </select>
              <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={`${inputClass} md:w-44`}>
                <option value="todos">Todos los estados</option>
                {ESTADOS.map((name) => <option key={name} value={name}>{nombreEstado(name)}</option>)}
              </select>
              <button type="button" aria-pressed={soloWa} onClick={() => setSoloWa((v) => !v)} className={`col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors ${soloWa ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-ink/70 hover:text-ink'}`}>
                <MessageCircle className="size-4" /> Con WhatsApp
              </button>
            </div>
          </div>
          <p className="border-b border-line bg-paper/50 px-4 py-2 text-xs text-muted-ink">{banco.length} {banco.length === 1 ? 'negocio' : 'negocios'} · primero los que tienen WhatsApp y un motivo para ofrecerles</p>
          {banco.length === 0 ? (
            <EmptyState>No hay prospectos con estos filtros.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {banco.slice(0, limit).map((p) => (
                <li key={p.id} className="flex items-center">
                  <button type="button" onClick={() => setOpenId(p.id)} className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-paper md:grid-cols-[minmax(0,1fr)_140px_150px_72px_16px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.negocio}</span>
                      <span className="block truncate text-xs text-muted-ink">{[p.rubro, p.ciudad].filter(Boolean).join(' · ') || '—'}{p.motivo && <span className="text-orange-600"> · {p.motivo.split(';')[0]}</span>}</span>
                    </span>
                    <span className="hidden truncate text-xs text-muted-ink md:block">{p.producto}</span>
                    <span className="hidden md:block"><Badge tone={ESTADO_TONE[p.estado]}>{nombreEstado(p.estado)}</Badge></span>
                    <span className="flex items-center justify-end gap-2 text-ink/35">
                      {p.web && <Globe className="size-4" aria-label="Tiene web" />}
                      {waLink(p.whatsapp) ? <MessageCircle className="size-4 text-emerald-600" aria-label="Tiene WhatsApp" /> : p.whatsapp ? <Phone className="size-4" aria-label="Tiene teléfono" /> : null}
                    </span>
                    <ChevronRight className="hidden size-4 text-ink/30 md:block" />
                  </button>
                  {/* Elegido para trabajar: pasa a la columna «Hacer demo» del embudo. */}
                  {p.estado === 'Prospecto' ? (
                    <button type="button" title="Pasar a «Hacer demo»" onClick={() => quick(p.id, { estado: 'Hacer demo' }, undefined, `${p.negocio} pasó a «Hacer demo»`)} className="mr-3 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 md:mr-4">
                      <Plus className="size-4" /> <span className="hidden sm:inline">Hacer demo</span>
                    </button>
                  ) : (
                    <span className="mr-3 w-9 shrink-0 md:mr-4 sm:w-[118px]" />
                  )}
                </li>
              ))}
            </ul>
          )}
          {banco.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <button type="button" className={btn.secondary} onClick={() => setLimit((n) => n + PAGE)}>Mostrar {Math.min(PAGE, banco.length - limit)} más</button>
            </div>
          )}
        </section>
      )}

      {open && <ProspectSheet key={open.id} prospect={open} api={api} save={save} notify={notify} today={today} onClose={() => setOpenId(null)} onDeleted={(id) => { setProspects((list) => list.filter((p) => p.id !== id)); setOpenId(null) }} />}
      {creating && <NewProspect api={api} onClose={() => setCreating(false)} onCreated={(p) => { setProspects((list) => [p, ...list]); setCreating(false); setOpenId(p.id); notify('Prospecto cargado') }} />}

      {dragging && createPortal(
        <div data-col="Prospecto" className={`fixed inset-x-4 bottom-4 z-[60] mx-auto flex h-16 max-w-md items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold shadow-[0_20px_50px_-20px_rgba(11,19,34,0.5)] transition-colors ${overCol === 'Prospecto' ? 'border-brand bg-brand text-white' : 'border-ink/25 bg-white text-ink/70'}`}>
          <Undo2 className="size-4" /> Soltá acá para devolver a «Por contactar»
        </div>,
        document.body,
      )}
      {dragging && createPortal(
        <div ref={ghost} aria-hidden="true" style={{ width: dragging.width }} className="pointer-events-none fixed left-0 top-0 z-[100] rounded-xl border border-ink/15 bg-white p-3 pr-9 shadow-[0_28px_60px_-20px_rgba(11,19,34,0.55)] will-change-transform">
          {(() => { const p = prospects.find((x) => x.id === dragging.id); return p ? <CardBody p={p} when={p.proximoFecha ? cuando(p.proximoFecha, today) : null} today={today} /> : null })()}
        </div>,
        document.body,
      )}
      {toast && (
        <div role="status" className={`fixed inset-x-4 bottom-4 z-[95] mx-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-20px_rgba(11,19,34,0.5)] sm:inset-x-auto sm:right-6 ${toast.tone === 'ok' ? 'bg-ink' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </AdminShell>
  )
}

type Api = (path: string, init?: RequestInit) => Promise<any>

const DATA_FIELDS: { key: keyof Patch; label: string; type?: string; wide?: boolean }[] = [
  { key: 'negocio', label: 'Negocio' },
  { key: 'rubro', label: 'Rubro' },
  { key: 'contacto', label: 'Persona de contacto' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'web', label: 'Web o carta actual', wide: true },
  { key: 'instagram', label: 'Instagram', wide: true },
  { key: 'demo', label: 'Link de la demo', wide: true },
  { key: 'seguimiento', label: 'Seguimiento (etiqueta corta)' },
]

function ProspectSheet({ prospect: p, api, save, notify, today, onClose, onDeleted }: { prospect: Prospect; api: Api; save: (id: string, patch: Patch, evento?: Evento) => Promise<Prospect>; notify: (m: string, t?: Toast['tone']) => void; today: string; onClose: () => void; onDeleted: (id: string) => void }) {
  const [confirm, confirmDialog] = useConfirm()
  const [events, setEvents] = useState<ProspectEvent[] | null>(null)
  const [form, setForm] = useState<Patch>(p)
  const [medio, setMedio] = useState('WhatsApp')
  const [nota, setNota] = useState('')
  const [paso, setPaso] = useState(p.proximoPaso || 'Recontactar')
  const [fecha, setFecha] = useState(p.proximoFecha)
  const [mensaje, setMensaje] = useState(() => (SIN_CONTACTO.includes(p.estado) ? primerMensaje(p) : mensajeSeguimiento(p)))
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<{ label: string; url: string } | null>(null)
  const wa = waLink(p.whatsapp, mensaje)

  const loadEvents = useCallback(() => {
    api(`/api/administracion/prospects/events?id=${p.id}`).then(setEvents).catch(() => setEvents([]))
  }, [api, p.id])
  useEffect(loadEvents, [loadEvents])

  async function run(patch: Patch, evento: Evento | undefined, ok: string) {
    setBusy(true)
    try {
      await save(p.id, patch, evento)
      loadEvents()
      notify(ok)
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Registrar un contacto: si todavía no se le había hablado pasa a «Contactado» y queda agendado el próximo paso.
  function registrar(tipo: string, texto: string, proximo = { paso, fecha }) {
    const patch: Patch = { proximoPaso: proximo.fecha ? proximo.paso.trim() || 'Recontactar' : proximo.paso.trim(), proximoFecha: proximo.fecha }
    if (tipo !== 'Nota') {
      patch.fechaContacto = today
      if (SIN_CONTACTO.includes(p.estado)) patch.estado = 'Contactado'
    }
    return run(patch, { tipo, texto }, tipo === 'Nota' ? 'Nota guardada' : `Contacto registrado${patch.proximoFecha ? ` · próximo: ${fmtDay(patch.proximoFecha)}` : ''}`)
  }

  function enviarWhatsApp() {
    const proximo = fecha ? { paso, fecha } : { paso: 'Recontactar', fecha: isoIn(3) }
    setFecha(proximo.fecha)
    registrar('WhatsApp', SIN_CONTACTO.includes(p.estado) ? 'Primer mensaje enviado desde el panel' : 'Mensaje de seguimiento enviado desde el panel', proximo)
  }

  async function guardarContacto() {
    if (await registrar(medio, nota.trim() || (medio === 'Nota' ? '' : `Contacto por ${medio.toLowerCase()}`))) setNota('')
  }

  // Solo los campos del formulario: estado y próximo paso se cambian arriba y no deben pisarse desde acá.
  const changed = [...DATA_FIELDS.map((f) => f.key), 'producto', 'motivo', 'notas'].filter((k) => (form[k as keyof Patch] ?? '') !== (p[k as keyof Patch] ?? '')) as (keyof Patch)[]
  async function guardarDatos() {
    const patch = Object.fromEntries(changed.map((k) => [k, form[k]])) as Patch
    if (patch.demo && (p.estado === 'Prospecto' || p.estado === 'Hacer demo')) patch.estado = 'Demo lista'
    if (await run(patch, undefined, patch.estado === 'Demo lista' ? 'Datos guardados · pasó a «Demo lista»' : 'Datos guardados')) {
      if (patch.whatsapp !== undefined) setForm((f) => ({ ...f, whatsapp: phoneDigits(patch.whatsapp ?? '') }))
    }
  }

  async function eliminar() {
    if (!(await confirm({ title: `¿Eliminar ${p.negocio}?`, message: 'Se borran sus datos y su historial. No se puede deshacer.', confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await api(`/api/administracion/prospects?id=${p.id}`, { method: 'DELETE' })
      notify('Prospecto eliminado')
      onDeleted(p.id)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar', 'error')
    }
  }

  const links = [
    p.web && { label: p.producto === 'Carta digital' ? 'Carta actual' : 'Web actual', url: p.web, icon: Globe, view: true },
    p.demo && { label: 'Demo', url: p.demo, icon: MonitorSmartphone, view: true },
    p.instagram && { label: 'Instagram', url: p.instagram, icon: Instagram },
    p.email && { label: 'Email', url: `mailto:${p.email}`, icon: Mail },
    p.whatsapp && { label: p.whatsapp, url: `tel:${p.whatsapp}`, icon: Phone },
  ].filter(Boolean) as { label: string; url: string; icon: typeof Globe; view?: boolean }[]

  return (
    <Modal
      eyebrow={[p.producto, p.rubro].filter(Boolean).join(' · ')}
      title={p.negocio}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={eliminar} className={btn.danger} aria-label="Eliminar prospecto"><Trash2 className="size-4" /></button>
          <button type="button" onClick={onClose} className={btn.secondary}>Cerrar</button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="estado">Estado</label>
          <select id="estado" value={p.estado} disabled={busy} onChange={(e) => run({ estado: e.target.value as Estado }, undefined, `Pasó a «${nombreEstado(e.target.value)}»`)} className="h-9 rounded-full border border-line bg-paper px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10">
            {ESTADOS.map((e) => <option key={e} value={e}>{nombreEstado(e)}</option>)}
          </select>
          {links.map(({ label, url, icon: Icon, view }) => {
            const pill = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-medium text-ink/80 transition-colors hover:border-ink/30 hover:text-ink'
            return view ? (
              <button key={label} type="button" onClick={() => setViewing({ label, url: href(url) })} className={pill}>
                <Icon className="size-3.5" /> {label}
              </button>
            ) : (
              <a key={label} href={url.startsWith('mailto:') || url.startsWith('tel:') ? url : href(url)} target="_blank" rel="noreferrer" className={pill}>
                <Icon className="size-3.5" /> {label}
              </a>
            )
          })}
        </div>

        {/* En pantallas anchas: a la izquierda lo que se hace (mensaje y contacto), a la derecha lo que se sabe. */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Mensaje de WhatsApp</h3>
            <div className="flex gap-1 text-xs">
              <button type="button" className="rounded-full px-2 py-1 text-muted-ink hover:bg-paper hover:text-ink" onClick={() => setMensaje(primerMensaje(p))}>Primer mensaje</button>
              <button type="button" className="rounded-full px-2 py-1 text-muted-ink hover:bg-paper hover:text-ink" onClick={() => setMensaje(mensajeSeguimiento(p))}>Seguimiento</button>
            </div>
          </div>
          <textarea aria-label="Mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={5} className={`${inputClass} mt-3 h-auto py-2.5 leading-relaxed`} />
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" onClick={enviarWhatsApp} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30">
              <MessageCircle className="size-4" /> Enviar por WhatsApp
            </a>
          ) : (
            <p className="mt-3 text-xs text-muted-ink">Para escribirle desde acá, cargá un WhatsApp de 10 dígitos en los datos del negocio.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line p-4">
          <h3 className="font-semibold">Registrar contacto</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MEDIOS.map(({ tipo, icon: Icon }) => (
              <button key={tipo} type="button" aria-pressed={medio === tipo} onClick={() => setMedio(tipo)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${medio === tipo ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink/70 hover:text-ink'}`}>
                <Icon className="size-3.5" /> {tipo}
              </button>
            ))}
          </div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={medio === 'Nota' ? 'Escribí la nota' : '¿Qué pasó? (opcional)'} className={`${inputClass} mt-3`} />
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px]">
            <label className="text-xs font-medium text-muted-ink">Próximo paso<input value={paso} onChange={(e) => setPaso(e.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-medium text-muted-ink">Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} /></label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PASOS.map((name) => (
              <button key={name} type="button" onClick={() => setPaso(name)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${paso === name ? 'bg-orange-50 text-orange-700 ring-orange-200' : 'text-muted-ink ring-line hover:text-ink'}`}>{name}</button>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" />
            {PLAZOS.map(({ label, days }) => (
              <button key={label} type="button" onClick={() => setFecha(isoIn(days))} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${fecha === isoIn(days) ? 'bg-brand-light text-brand ring-brand/30' : 'text-muted-ink ring-line hover:text-ink'}`}>{label}</button>
            ))}
            <button type="button" onClick={() => setFecha('')} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${!fecha ? 'bg-paper text-ink ring-ink/20' : 'text-muted-ink ring-line hover:text-ink'}`}>Sin fecha</button>
          </div>
          <button type="button" disabled={busy || (medio === 'Nota' && !nota.trim())} onClick={guardarContacto} className={`${btn.primary} mt-4 w-full`}>{medio === 'Nota' ? 'Guardar nota' : 'Guardar contacto'}</button>
        </section>

        </div>
        <div className="flex flex-col gap-6">
        {p.motivo && (
          <div className="flex gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-900 ring-1 ring-inset ring-orange-200">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-orange-600" />
            <div><p className="font-semibold">Qué ofrecerle</p><p className="mt-1 leading-relaxed">{p.motivo.replace(/;/g, ' ·')}</p></div>
          </div>
        )}

        <details className="group rounded-2xl border border-line p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            Datos del negocio <ChevronRight className="size-4 text-ink/40 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {DATA_FIELDS.map(({ key, label, type, wide }) => (
              <label key={key} className={`text-xs font-medium text-muted-ink ${wide ? 'sm:col-span-2' : ''}`}>
                {label}
                <input type={type ?? 'text'} value={(form[key] as string) ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={`${inputClass} mt-1`} />
              </label>
            ))}
            <label className="text-xs font-medium text-muted-ink">
              Producto
              <select value={form.producto} onChange={(e) => setForm((f) => ({ ...f, producto: e.target.value }))} className={`${inputClass} mt-1`}>
                {PRODUCTOS.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-ink sm:col-span-2">
              Qué ofrecerle
              <textarea value={form.motivo ?? ''} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} rows={2} className={`${inputClass} mt-1 h-auto py-2.5`} />
            </label>
            <label className="text-xs font-medium text-muted-ink sm:col-span-2">
              Notas
              <textarea value={form.notas ?? ''} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={3} className={`${inputClass} mt-1 h-auto py-2.5`} />
            </label>
          </div>
          <button type="button" disabled={busy || changed.length === 0} onClick={guardarDatos} className={`${btn.primary} mt-4`}>Guardar datos</button>
        </details>

        <section>
          <h3 className="font-semibold">Historial</h3>
          {events === null ? (
            <p className="mt-3 text-sm text-muted-ink">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="mt-3 text-sm text-muted-ink">Sin movimientos todavía.</p>
          ) : (
            <ol className="relative mt-4 space-y-4 border-l border-line pl-5">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${ev.tipo === 'Estado' ? 'bg-brand' : ev.tipo === 'Nota' ? 'bg-ink/30' : 'bg-orange-500'}`} />
                  <p className="text-sm"><span className="font-semibold">{ev.tipo}</span>{ev.texto && <span className="text-ink/80"> · {ev.texto}</span>}</p>
                  <p className="text-xs text-muted-ink">{fmtDay(ev.fecha.slice(0, 10))}{ev.fecha.slice(11) !== '00:00' && ` · ${ev.fecha.slice(11)}`}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        </div>
        </div>
      </div>
      {confirmDialog}
      {viewing && <SiteViewer title={`${viewing.label} · ${p.negocio}`} url={viewing.url} onClose={() => setViewing(null)} />}
    </Modal>
  )
}

// Contenido de una tarjeta del embudo (se usa también en la copia que sigue al puntero al arrastrar).
function CardBody({ p, when, today }: { p: Prospect; when: ReturnType<typeof cuando> | null; today: string }) {
  return (
    <>
      <span className="line-clamp-2 font-semibold leading-snug">{p.negocio}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-ink">{p.rubro || p.producto}</span>
      <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {when && <Badge tone={when.tone}><CalendarClock className="size-3" />{when.text}</Badge>}
        {p.fechaContacto && <span className="text-[11px] text-muted-ink">Contacto hace {Math.max(0, daysBetween(p.fechaContacto, today))} d</span>}
        {!p.fechaContacto && p.demo && <span className="text-[11px] text-muted-ink">Demo lista</span>}
      </span>
    </>
  )
}

// Menú de los tres puntos de cada tarjeta del embudo: atajos sin abrir la ficha.
function CardMenu({ p, anchor, today, onClose, onOpen, onAction, notify }: { p: Prospect; anchor: DOMRect; today: string; onClose: () => void; onOpen: () => void; onAction: (patch: Patch, evento: Evento | undefined, ok: string) => void; notify: (m: string, t?: Toast['tone']) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const act = (patch: Patch, evento: Evento | undefined, ok: string) => { onClose(); onAction(patch, evento, ok) }
  const nuevo = SIN_CONTACTO.includes(p.estado)
  const wa = waLink(p.whatsapp, nuevo ? primerMensaje(p) : mensajeSeguimiento(p))
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink/85 transition-colors hover:bg-paper hover:text-ink [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink/45'
  // Portal con posición fija junto al botón: así el menú no queda recortado por el scroll del tablero.
  const width = 256
  const below = window.innerHeight - anchor.bottom > 420
  const position = { left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)), ...(below ? { top: anchor.bottom + 4 } : { bottom: window.innerHeight - anchor.top + 4 }) }
  return createPortal(
    <>
      <div className="fixed inset-0 z-[45]" onClick={onClose} onWheel={onClose} aria-hidden="true" />
      <div role="menu" aria-label={`Opciones de ${p.negocio}`} style={position} className="animate-rise-in fixed z-[46] w-64 rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(11,19,34,0.45)] [animation-duration:180ms]">
        <button role="menuitem" type="button" className={item} onClick={onOpen}><ChevronRight /> Abrir ficha</button>
        {wa && (
          <a role="menuitem" href={wa} target="_blank" rel="noreferrer" className={item} onClick={() => act({ fechaContacto: today, ...(nuevo && { estado: 'Contactado' as Estado }), proximoPaso: p.proximoPaso || 'Recontactar', proximoFecha: p.proximoFecha || isoIn(3) }, { tipo: 'WhatsApp', texto: nuevo ? 'Primer mensaje enviado desde el embudo' : 'Mensaje de seguimiento enviado desde el embudo' }, 'Contacto registrado')}>
            <MessageCircle /> Escribir por WhatsApp
          </a>
        )}
        <button role="menuitem" type="button" className={item} onClick={() => act({ proximoPaso: 'Recontactar', proximoFecha: isoIn(1) }, undefined, 'Agendado: recontactar mañana')}><CalendarClock /> Recontactar mañana</button>
        <button role="menuitem" type="button" className={item} onClick={() => act({ proximoPaso: 'Recontactar', proximoFecha: isoIn(7) }, undefined, 'Agendado: recontactar en una semana')}><CalendarClock /> Recontactar en una semana</button>
        {p.demo && (
          <button role="menuitem" type="button" className={item} onClick={() => { onClose(); navigator.clipboard.writeText(p.demo).then(() => notify('Link de la demo copiado'), () => notify('No se pudo copiar', 'error')) }}><Copy /> Copiar link de la demo</button>
        )}
        <div className="my-1.5 h-px bg-line" />
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-ink">Mover a</p>
        <div className="flex flex-wrap gap-1 px-1.5 pb-1">
          {ESTADOS.filter((e) => e !== p.estado && e !== 'Prospecto' && e !== 'Rechazado' && e !== 'En pausa').map((e) => (
            <button key={e} role="menuitem" type="button" onClick={() => act({ estado: e }, undefined, `${p.negocio} pasó a «${e}»`)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink/75 ring-1 ring-inset ring-line transition-colors hover:bg-paper hover:text-ink">{e}</button>
          ))}
        </div>
        <div className="my-1.5 h-px bg-line" />
        <button role="menuitem" type="button" className={item} onClick={() => act({ estado: 'Prospecto' }, undefined, `${p.negocio} volvió a «Por contactar»`)}><Undo2 /> Devolver a Por contactar</button>
        {p.estado !== 'En pausa' && <button role="menuitem" type="button" className={item} onClick={() => act({ estado: 'En pausa', proximoPaso: '', proximoFecha: '' }, undefined, `${p.negocio} quedó en pausa`)}><PauseCircle /> Poner en pausa</button>}
        {p.estado !== 'Rechazado' && <button role="menuitem" type="button" className={`${item} text-red-600 hover:bg-red-50 hover:text-red-700 [&>svg]:text-red-500`} onClick={() => act({ estado: 'Rechazado', proximoPaso: '', proximoFecha: '' }, undefined, `${p.negocio} pasó a «Rechazado»`)}><Ban /> Marcar como rechazado</button>}
      </div>
    </>,
    document.body,
  )
}

// Muestra una web a pantalla completa encima de la ficha. Las que no tienen HTTPS o no se dejan mostrar dentro de otra
// página llegan a través del servidor del panel (lib/admin/site-proxy.ts), sin JavaScript: sliders y menús animados no andan.
function SiteViewer({ title, url: original, onClose }: { title: string; url: string; onClose: () => void }) {
  // Los archivos de Drive (muchas cartas actuales) sí se dejan mostrar en su modo «preview».
  const url = original.replace(/^(https:\/\/drive\.google\.com\/file\/d\/[^/?#]+)\/view.*$/, '$1/preview')
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const [frame, setFrame] = useState<{ src: string; proxied: boolean } | null>(null)
  useEffect(() => {
    fetch(`/api/administracion/prospects/frame?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => setFrame(d.src ? d : { src: url, proxied: false }))
      .catch(() => setFrame({ src: url, proxied: false }))
  }, [url])
  // Portal al body: la animación de la ficha deja un transform que encerraría al visor dentro de ella.
  return createPortal(
    // data-confirm-dialog: así el Escape cierra solo el visor y no también la ficha de abajo.
    <div data-confirm-dialog role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[85] flex flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-ink">{url}{frame?.proxied && ' · vista a través del panel, sin animaciones'}</p>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className={`${btn.secondary} h-9 shrink-0 px-3`}>
          <ExternalLink className="size-4" /> <span className="hidden sm:inline">Abrir en pestaña nueva</span>
        </a>
        <button type="button" autoFocus aria-label="Cerrar" onClick={onClose} className={`${btn.icon} shrink-0`}>
          <X className="size-4" />
        </button>
      </header>
      {frame ? (
        // Lo que pasa por el proxy llega sin JavaScript (encabezado CSP), así no puede tocar el panel.
        <iframe src={frame.src} title={title} className="w-full flex-1 border-0 bg-white" />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-paper text-sm text-muted-ink">Cargando…</div>
      )}
    </div>,
    document.body,
  )
}

function NewProspect({ api, onClose, onCreated }: { api: Api; onClose: () => void; onCreated: (p: Prospect) => void }) {
  const [form, setForm] = useState({ negocio: '', producto: 'Rediseño web', rubro: '', whatsapp: '', web: '', instagram: '', demo: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onCreated(await api('/api/administracion/prospects', { method: 'POST', body: JSON.stringify({ ...form, estado: form.demo.trim() ? 'Demo lista' : 'Prospecto' }) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Ventas" title="Nuevo prospecto" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-ink sm:col-span-2">Negocio *<input required autoFocus value={form.negocio} onChange={set('negocio')} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-muted-ink">Producto
          <select value={form.producto} onChange={set('producto')} className={`${inputClass} mt-1`}>{PRODUCTOS.map((name) => <option key={name}>{name}</option>)}</select>
        </label>
        <label className="text-xs font-medium text-muted-ink">Rubro<input value={form.rubro} onChange={set('rubro')} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-muted-ink">WhatsApp<input type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="351 123 4567" className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-muted-ink">Instagram<input value={form.instagram} onChange={set('instagram')} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-muted-ink sm:col-span-2">Web o carta actual<input value={form.web} onChange={set('web')} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-medium text-muted-ink sm:col-span-2">Link de la demo (si ya la hiciste)<input value={form.demo} onChange={set('demo')} className={`${inputClass} mt-1`} /></label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className={btn.secondary}>Cancelar</button>
          <button type="submit" disabled={busy} className={btn.accent}><Plus className="size-4" /> Cargar</button>
        </div>
      </form>
    </Modal>
  )
}
