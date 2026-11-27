'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { btn } from '@/components/admin/ui'

type State = 'cargando' | 'no-soportado' | 'instalar' | 'bloqueado' | 'apagado' | 'activo'

const SW = '/admin-sw.js'
const toKey = (base64: string) => Uint8Array.from(atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

// Botón para recibir el resumen diario en este dispositivo (notificación push a las 8).
export function PushToggle() {
  const [state, setState] = useState<State>('cargando')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // En iPhone los avisos solo funcionan con el panel agregado a la pantalla de inicio.
      setState(ios && !standalone ? 'instalar' : 'no-soportado')
      return
    }
    if (Notification.permission === 'denied') return setState('bloqueado')
    navigator.serviceWorker.getRegistration(SW).then((reg) => reg?.pushManager.getSubscription()).then((sub) => setState(sub ? 'activo' : 'apagado')).catch(() => setState('apagado'))
  }, [])

  async function activar() {
    setBusy(true)
    setNote('')
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('bloqueado')
      const reg = await navigator.serviceWorker.register(SW, { scope: '/administracion/' })
      await navigator.serviceWorker.ready
      const { publicKey } = await (await fetch('/api/administracion/push')).json()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
      const r = await fetch('/api/administracion/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
      if (!r.ok) throw new Error()
      setState('activo')
      setNote('Listo: todos los días a las 8 te llega el resumen.')
    } catch {
      setNote('No se pudieron activar los avisos en este navegador.')
    } finally {
      setBusy(false)
    }
  }

  async function apagar() {
    setBusy(true)
    try {
      const sub = await (await navigator.serviceWorker.getRegistration(SW))?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/administracion/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setState('apagado')
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  async function probar() {
    setBusy(true)
    const r = await fetch('/api/administracion/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) }).catch(() => null)
    setNote(r?.ok ? 'Aviso de prueba enviado.' : 'No se pudo mandar el aviso de prueba.')
    setBusy(false)
  }

  if (state === 'cargando' || state === 'no-soportado') return null
  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <div className="flex flex-wrap gap-2">
        {state === 'activo' ? (
          <>
            <button type="button" disabled={busy} onClick={probar} className={btn.secondary}><BellRing className="size-4" aria-hidden="true" />Probar aviso</button>
            <button type="button" disabled={busy} onClick={apagar} className={btn.secondary}><BellOff className="size-4" aria-hidden="true" />Apagar avisos</button>
          </>
        ) : state === 'apagado' ? (
          <button type="button" disabled={busy} onClick={activar} className={btn.accent}><Bell className="size-4" aria-hidden="true" />Avisarme cada mañana</button>
        ) : (
          <p className="max-w-xs text-xs text-muted-ink md:text-right">
            {state === 'instalar' ? 'Para recibir avisos en el iPhone, abrí el panel en Safari, tocá Compartir → «Agregar a inicio» y entrá desde ese ícono.' : 'Los avisos están bloqueados para este sitio: habilitalos en los ajustes del navegador.'}
          </p>
        )}
      </div>
      {note && <p className="text-xs text-muted-ink" role="status">{note}</p>}
    </div>
  )
}
