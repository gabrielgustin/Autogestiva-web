'use client'

// «Agenda de hoy»: lo que toca o está atrasado. La usan Prospectos y Clientes.
import { Check, ChevronRight, MessageCircle } from 'lucide-react'
import { daysBetween } from '@/lib/admin/prospects'
import { Badge, card } from '@/components/admin/ui'

export const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

// Etiqueta de una fecha agendada respecto de hoy: atrasado en rojo, hoy en naranja.
export function cuando(iso: string, today: string): { text: string; tone: 'red' | 'orange' | 'blue' | 'gray' } {
  const d = daysBetween(today, iso)
  if (d < 0) return { text: d === -1 ? 'Ayer' : `Atrasado ${-d} días`, tone: 'red' }
  if (d === 0) return { text: 'Hoy', tone: 'orange' }
  if (d === 1) return { text: 'Mañana', tone: 'blue' }
  return { text: fmtDay(iso), tone: 'gray' }
}

export type AgendaItem = { key: string; fecha: string; titulo: string; detalle: string; whatsapp?: boolean; onOpen: () => void; onDone: () => void }

export function Agenda({ items, today, className = '' }: { items: AgendaItem[]; today: string; className?: string }) {
  if (!items.length) return null
  return (
    <section className={`${card} overflow-hidden ${className}`} aria-labelledby="agenda-title">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
        <h2 id="agenda-title" className="font-display text-lg font-bold tracking-tight">Agenda de hoy</h2>
        <span className="text-xs text-muted-ink">{fmtDay(today)}</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const when = cuando(item.fecha, today)
          return (
            <li key={item.key} className="flex items-center">
              <button type="button" onClick={item.onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors hover:bg-paper md:pl-5">
                <Badge tone={when.tone} className="w-[92px] justify-center">{when.text}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.titulo}</span>
                  <span className="block truncate text-xs text-muted-ink">{item.detalle}</span>
                </span>
                {item.whatsapp && <MessageCircle className="size-4 shrink-0 text-emerald-600" aria-label="Tiene WhatsApp" />}
                <ChevronRight className="size-4 shrink-0 text-ink/30" />
              </button>
              <button type="button" onClick={item.onDone} aria-label={`Marcar hecho: ${item.titulo}`} className="mx-3 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 md:mx-5">
                <Check className="size-4" /> Hecho
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
