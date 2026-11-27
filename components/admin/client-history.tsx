'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProspectEvent } from '@/lib/admin/prospects'
import { fmtDay } from '@/components/admin/agenda'

const VISIBLES = 8

// Historial comercial del cliente: lo que pasó mientras era prospecto (mismo nombre de negocio que la empresa).
// shortcut: se vincula por nombre; si se renombra la empresa o el prospecto, deja de aparecer. Guardar el id del prospecto si pasa seguido.
export function ClientHistory({ empresa }: { empresa: string }) {
  const [data, setData] = useState<{ prospectId: string | null; events: ProspectEvent[] } | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    if (!empresa.trim() || empresa.trim() === '-') return
    fetch(`/api/administracion/prospects/events?negocio=${encodeURIComponent(empresa.trim())}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
  }, [empresa])

  if (!data?.prospectId) return null
  const events = all ? data.events : data.events.slice(0, VISIBLES)
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="eyebrow text-[10px] text-muted-ink">Historial comercial</p>
        <Link href={`/administracion/prospectos?abrir=${data.prospectId}`} className="text-xs font-semibold text-brand hover:underline">Ver ficha de prospecto</Link>
      </div>
      <ol className="relative space-y-3 rounded-2xl border border-line p-4 pl-8">
        <span aria-hidden="true" className="absolute inset-y-4 left-4 w-px bg-line" />
        {events.map((ev) => (
          <li key={ev.id} className="relative">
            <span className={`absolute -left-[19px] top-1.5 size-2 rounded-full ring-4 ring-white ${ev.tipo === 'Estado' ? 'bg-brand' : ev.tipo === 'Nota' ? 'bg-ink/30' : 'bg-orange-500'}`} />
            <p className="text-sm"><span className="font-semibold">{ev.tipo}</span>{ev.texto && <span className="text-ink/80"> · {ev.texto}</span>}</p>
            <p className="text-xs text-muted-ink">{fmtDay(ev.fecha.slice(0, 10))}</p>
          </li>
        ))}
        {data.events.length > VISIBLES && (
          <li><button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-brand hover:underline">{all ? 'Ver menos' : `Ver los ${data.events.length} movimientos`}</button></li>
        )}
      </ol>
    </div>
  )
}
