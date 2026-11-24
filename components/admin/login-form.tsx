'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { Logo } from '@/components/logo'
import { btn, inputClass } from '@/components/admin/ui'
import { TAB_MARKER } from '@/components/admin/session-guard'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/administracion/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudo iniciar sesión')
      sessionStorage.setItem(TAB_MARKER, '1')
      router.push('/administracion')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <a href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-ink transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a la web
      </a>
      <form onSubmit={submit} className="w-full rounded-3xl border border-line bg-white p-6 shadow-[0_30px_70px_-35px_rgba(11,19,34,0.35)] sm:p-8">
        <Logo bg="#ffffff" className="h-[38px]" />
        <p className="eyebrow mt-8 flex items-center gap-2 text-[10px] text-muted-ink">
          <Lock className="size-3" aria-hidden="true" />
          Panel de administración
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-[-0.035em]">Ingresá a tu panel</h1>
        <p className="mt-2 text-sm text-muted-ink">Clientes, cobros e infraestructura en un solo lugar.</p>
        <div className="mt-6 grid gap-4">
          <label className="text-xs font-semibold text-ink/70">
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1.5`} />
          </label>
          <label className="text-xs font-semibold text-ink/70">
            Contraseña
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-1.5`} />
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className={`${btn.primary} mt-6 h-11 w-full`}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
