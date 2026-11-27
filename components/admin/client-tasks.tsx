'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { ClientTask } from '@/lib/admin/clients-shared'
import { Badge, btn, inputClass } from '@/components/admin/ui'
import { DateField } from '@/components/admin/pickers'
import { cuando } from '@/components/admin/agenda'

// Pendientes de un cliente dentro de su detalle: lo agendado y el alta de uno nuevo.
export function ClientTasks({ tasks, today, onAdd, onDone }: { tasks: ClientTask[]; today: string; onAdd: (texto: string, fecha: string) => Promise<boolean>; onDone: (task: ClientTask) => void }) {
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!texto.trim() || !fecha) return
    setSaving(true)
    if (await onAdd(texto.trim(), fecha)) {
      setTexto('')
      setFecha('')
    }
    setSaving(false)
  }

  return (
    <div className="mb-5">
      <p className="eyebrow mb-2 text-[10px] text-muted-ink">Pendientes</p>
      <div className="rounded-2xl border border-line">
        {tasks.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
            {tasks.map((task) => {
              const when = cuando(task.fecha, today)
              return (
                <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Badge tone={when.tone} className="w-[92px] justify-center">{when.text}</Badge>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{task.texto}</span>
                  <button type="button" onClick={() => onDone(task)} aria-label={`Marcar hecho: ${task.texto}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
                    <Check className="size-3.5" aria-hidden="true" /> Hecho
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form onSubmit={submit} className="grid gap-2 p-4 sm:grid-cols-[1fr_170px_auto] sm:items-end">
          <label className="text-xs font-medium text-muted-ink">Qué hay que hacer<input value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} className={`${inputClass} mt-1`} /></label>
          <div className="text-xs font-medium text-muted-ink">Fecha<div className="mt-1"><DateField ariaLabel="Fecha del pendiente" value={fecha} onChange={setFecha} /></div></div>
          <button type="submit" disabled={saving || !texto.trim() || !fecha} className={`${btn.primary} h-11`}>Agendar</button>
        </form>
      </div>
    </div>
  )
}
