'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CircleHelp, ShieldCheck, X } from 'lucide-react'
import { Logo } from '@/components/logo'
import { LogoutButton } from '@/components/admin/session-guard'

// Piezas del panel con el mismo lenguaje visual que la web pública (papel, tinta, azul de marca, naranja de acento).

export const btn = {
  primary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:opacity-50',
  accent:
    'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-orange-500 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(249,115,22,0.7)] transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30 disabled:opacity-50',
  secondary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30 hover:bg-paper focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:opacity-50',
  icon:
    'inline-flex size-9 items-center justify-center rounded-full border border-line bg-white text-ink/70 transition-colors hover:border-ink/30 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:opacity-30',
  danger:
    'inline-flex size-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20',
}

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition-shadow placeholder:text-ink/35 focus:border-brand focus:ring-4 focus:ring-brand/10'

export const card = 'rounded-2xl border border-line bg-white'

const nav = [
  { href: '/administracion/hoy', label: 'Hoy' },
  { href: '/administracion/clientes', label: 'Clientes' },
  { href: '/administracion', label: 'Infraestructura' },
  { href: '/administracion/prospectos', label: 'Prospectos' },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const active = (href: string) => (href === '/administracion' ? pathname === href || pathname.startsWith('/administracion/proyectos') : pathname.startsWith(href))
  return (
    <div className="bg-blueprint min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/administracion/hoy" aria-label="Autogestiva, ir a Hoy">
              <Logo bg="#ffffff" className="h-[34px] md:h-[38px]" />
            </Link>
            <span className="eyebrow hidden rounded-full border border-line px-2.5 py-1.5 text-[10px] text-muted-ink sm:inline-block">Panel</span>
          </div>
          <div className="flex items-center gap-2 md:order-last">
            <Link href="/administracion/seguridad" aria-label="Seguridad de la cuenta" title="Seguridad" className={`${btn.icon} size-10 ${pathname.startsWith('/administracion/seguridad') ? '!border-ink !bg-ink !text-white' : ''}`}>
              <ShieldCheck className="size-4" aria-hidden="true" />
            </Link>
            <LogoutButton />
          </div>
          <nav aria-label="Secciones del panel" className="flex w-full gap-1 rounded-full border border-line bg-paper p-1 md:w-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? 'page' : undefined}
                className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-2 text-center text-[13px] font-semibold sm:px-4 sm:text-sm transition-colors md:flex-none ${active(item.href) ? 'bg-ink text-white' : 'text-ink/70 hover:bg-white hover:text-ink'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-8 md:pt-10">{children}</div>
      </main>
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-3 text-muted-ink">
          <span className="h-px w-8 bg-ink/25" />
          {eyebrow}
        </p>
        <h1 className="font-display mt-3 text-[2rem] font-bold leading-none tracking-[-0.035em] md:text-[2.75rem]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] text-muted-ink">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, detail, icon }: { label: string; value: React.ReactNode; detail?: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className={`${card} p-4 md:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-muted-ink md:text-sm">{label}</div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand [&>svg]:size-4">{icon}</div>
      </div>
      <div className="font-display mt-3 text-2xl font-bold tracking-tight md:text-3xl">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted-ink">{detail}</div>}
    </div>
  )
}

const badgeTones = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-brand-light text-brand ring-brand/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  gray: 'bg-paper text-muted-ink ring-line',
}

export function Badge({ tone = 'gray', children, className = '' }: { tone?: keyof typeof badgeTones; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badgeTones[tone]} ${className}`}>{children}</span>
}

// Ventana modal: cierra con Escape o tocando afuera, y bloquea el scroll de la página mientras está abierta.
export function Modal({ title, eyebrow, onClose, children, footer, wide }: { title: React.ReactNode; eyebrow?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    // Escape con un calendario o una lista abiertos cierra solo ese desplegable, no la ventana.
    // Con dos ventanas apiladas cierra solo la de arriba.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[data-radix-popper-content-wrapper], [data-confirm-dialog]')) return
      const stack = document.querySelectorAll('[data-admin-modal]')
      if (stack[stack.length - 1] === self.current) onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // En captura: corre antes de que el desplegable se cierre solo; si no, ya no lo encuentra y cierra también la ventana.
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={self} data-admin-modal role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={`animate-rise-in flex max-h-[92vh] [animation-duration:280ms] w-full ${wide ? 'max-w-6xl' : 'max-w-2xl'} flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_30px_70px_-25px_rgba(11,19,34,0.45)] sm:rounded-3xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow text-[10px] text-orange-600">{eyebrow}</p>}
            <h2 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-balance">{title}</h2>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className={btn.icon}>
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
        {footer && <div className="border-t border-line bg-paper/60 px-5 py-4 sm:px-7">{footer}</div>}
      </section>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-sm text-muted-ink">{children}</div>
}

type ConfirmOptions = { title: string; message?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

// Reemplaza a window.confirm con una ventana del panel: `const [confirm, confirmDialog] = useConfirm()`,
// `if (!(await confirm({ title: '…' }))) return` y renderizar {confirmDialog} en el componente.
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), [])
  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  const dialog = pending ? <ConfirmDialog {...pending} onAnswer={answer} /> : null
  return [confirm, dialog] as const
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, onAnswer }: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onAnswer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])
  const Icon = danger ? AlertTriangle : CircleHelp
  return (
    <div data-confirm-dialog className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(false) }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="animate-rise-in w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_30px_70px_-25px_rgba(11,19,34,0.45)] [animation-duration:220ms]">
        <div className={`flex size-11 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-600' : 'bg-brand-light text-brand'}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h2 id="confirm-title" className="font-display mt-4 text-xl font-bold tracking-tight text-balance">{title}</h2>
        {message && <div className="mt-2 text-sm leading-relaxed text-muted-ink">{message}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onAnswer(false)} className={btn.secondary}>{cancelLabel}</button>
          <button type="button" autoFocus onClick={() => onAnswer(true)} className={danger ? `${btn.primary} bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/30` : btn.primary}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
