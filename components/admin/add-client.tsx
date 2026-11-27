'use client'

import { useState } from 'react'
import { datosCliente, type Prospect } from '@/lib/admin/prospects'
import { Modal, btn } from '@/components/admin/ui'
import { ClientFields, emptyForm, isCustomPlan, missingFields } from '@/components/admin/client-form'

// Alta en el panel de clientes de un prospecto que pasó a «Cliente», precargada con lo que ya se sabe.
export function AddClient({ prospect, api, onClose, onCreated }: { prospect: Prospect; api: (path: string, init?: RequestInit) => Promise<unknown>; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...datosCliente(prospect) }))
  const [customPlan, setCustomPlan] = useState(() => isCustomPlan(form.plan))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const missing = missingFields(form)
    if (missing.length) return setError(`Completá: ${missing.join(', ')}.`)
    setSaving(true)
    setError('')
    try {
      await api('/api/administracion/clients', { method: 'POST', body: JSON.stringify(form) })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el cliente')
      setSaving(false)
    }
  }

  return (
    <Modal
      eyebrow="Panel de clientes"
      title={`Sumar a ${prospect.negocio}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onClose} className={btn.secondary}>Cancelar</button>
          <button type="submit" form="add-client-form" disabled={saving} className={btn.primary}>{saving ? 'Guardando…' : 'Crear cliente'}</button>
        </div>
      }
    >
      <form id="add-client-form" onSubmit={submit} className="space-y-6">
        <ClientFields form={form} setForm={setForm} customPlan={customPlan} setCustomPlan={setCustomPlan} />
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  )
}
