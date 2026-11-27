'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react'
import { AdminShell, PageHeader, btn, card, inputClass } from '@/components/admin/ui'

type Msg = { text: string; tone: 'ok' | 'error' } | null

async function call(body?: unknown) {
  const response = await fetch('/api/administracion/seguridad', { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (response.status === 401) { window.location.replace('/administracion/login'); throw new Error('La sesión venció') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar')
  return data
}

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null
  return <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>
}

const codeInput = `${inputClass} w-40 text-center font-mono text-lg tracking-[0.3em]`
const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6)

export function SecurityPanel() {
  const [status, setStatus] = useState<{ email: string; totp: boolean } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [totpMsg, setTotpMsg] = useState<Msg>(null)
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { call().then(setStatus).catch((e) => setLoadError(e.message)) }, [])
  useEffect(load, [load])

  async function run(action: () => Promise<void>, setMsg: (m: Msg) => void) {
    setBusy(true)
    setMsg(null)
    try { await action() } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'No se pudo guardar', tone: 'error' }) } finally { setBusy(false) }
  }

  const empezar = () => run(async () => { setSetup(await call({ action: 'totp-start' })); setCode('') }, setTotpMsg)
  const confirmar = () => run(async () => {
    await call({ action: 'totp-confirm', secret: setup!.secret, code })
    setSetup(null); setCode(''); load()
    setTotpMsg({ text: 'Listo: desde ahora, además de la contraseña, el panel te pide el código de la app.', tone: 'ok' })
  }, setTotpMsg)
  const apagar = () => run(async () => {
    await call({ action: 'totp-off', code })
    setCode(''); load()
    setTotpMsg({ text: 'Verificación en dos pasos desactivada.', tone: 'ok' })
  }, setTotpMsg)
  const cambiar = () => run(async () => {
    if (pw.next !== pw.repeat) throw new Error('Las dos contraseñas nuevas no coinciden')
    await call({ action: 'password', current: pw.current, next: pw.next })
    setPw({ current: '', next: '', repeat: '' })
    setPwMsg({ text: 'Contraseña cambiada.', tone: 'ok' })
  }, setPwMsg)

  return (
    <AdminShell>
      <PageHeader eyebrow="Cuenta" title="Seguridad" description="Cómo se protege el ingreso a tu panel." />
      {loadError && <p role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className={`${card} p-5 md:p-6`} aria-labelledby="totp-title">
          <div className="flex items-start gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${status?.totp ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {status?.totp ? <ShieldCheck className="size-5" aria-hidden="true" /> : <ShieldAlert className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <h2 id="totp-title" className="font-display text-xl font-bold tracking-tight">Verificación en dos pasos</h2>
              <p className="mt-1 text-sm text-muted-ink">
                {status === null ? (loadError ? 'No disponible.' : 'Consultando…') : status.totp ? 'Activa: para entrar hace falta la contraseña y el código de tu celular.' : 'Apagada: hoy alcanza con saber la contraseña para entrar.'}
              </p>
            </div>
          </div>

          {status && !status.totp && !setup && (
            <button type="button" disabled={busy} onClick={empezar} className={`${btn.accent} mt-5`}>Activar verificación en dos pasos</button>
          )}

          {setup && (
            <div className="mt-5 space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/80">
                <li>Instalá en el celular Google Authenticator, Microsoft Authenticator o similar.</li>
                <li>Escaneá este código con la app.</li>
                <li>Escribí el número de 6 dígitos que muestra.</li>
              </ol>
              <div className="w-48 rounded-xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} />
              <p className="text-xs text-muted-ink">¿No podés escanear? Cargá esta clave a mano: <span className="select-all break-all font-mono text-ink">{setup.secret}</span></p>
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(onlyDigits(e.target.value))} className={codeInput} placeholder="000000" />
                <button type="button" disabled={busy || code.length !== 6} onClick={confirmar} className={btn.primary}>Confirmar</button>
                <button type="button" disabled={busy} onClick={() => setSetup(null)} className={btn.secondary}>Cancelar</button>
              </div>
            </div>
          )}

          {status?.totp && (
            <div className="mt-5">
              <p className="text-xs text-muted-ink">Para desactivarla, escribí un código vigente de la app.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(onlyDigits(e.target.value))} className={codeInput} placeholder="000000" />
                <button type="button" disabled={busy || code.length !== 6} onClick={apagar} className={`${btn.secondary} text-red-600`}>Desactivar</button>
              </div>
            </div>
          )}
          <Note msg={totpMsg} />
        </section>

        <section className={`${card} p-5 md:p-6`} aria-labelledby="pw-title">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"><KeyRound className="size-5" aria-hidden="true" /></div>
            <div>
              <h2 id="pw-title" className="font-display text-xl font-bold tracking-tight">Cambiar contraseña</h2>
              <p className="mt-1 text-sm text-muted-ink">Mínimo 12 caracteres. Mejor una frase larga que no uses en otro sitio.</p>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); cambiar() }} className="mt-5 grid gap-3">
            <input type="email" autoComplete="username" value={status?.email ?? ''} readOnly hidden />
            <label className="text-xs font-semibold text-ink/70">Contraseña actual<input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-xs font-semibold text-ink/70">Nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-xs font-semibold text-ink/70">Repetila<input type="password" autoComplete="new-password" required minLength={12} value={pw.repeat} onChange={(e) => setPw((p) => ({ ...p, repeat: e.target.value }))} className={`${inputClass} mt-1.5`} /></label>
            <button type="submit" disabled={busy} className={`${btn.primary} justify-self-start`}>Cambiar contraseña</button>
          </form>
          <Note msg={pwMsg} />
        </section>
      </div>

      <section className={`${card} mt-6 p-5 text-sm text-ink/80 md:p-6`}>
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">Qué más protege el ingreso</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Tras 5 intentos fallidos desde un mismo lugar (o 20 con tu email) el ingreso se frena 15 minutos.</li>
          <li>Cada ingreso te llega como aviso al celular, si activaste los avisos en «Hoy».</li>
          <li>La sesión se cierra sola al cerrar la pestaña o tras 10 minutos sin actividad.</li>
          <li>Las contraseñas se guardan cifradas (bcrypt) y el panel no se puede mostrar dentro de otros sitios.</li>
        </ul>
      </section>
    </AdminShell>
  )
}
