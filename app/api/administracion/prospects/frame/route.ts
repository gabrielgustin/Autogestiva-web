import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'
import { proxyPath } from '@/lib/admin/site-proxy'

export const dynamic = 'force-dynamic'

// Decide cómo mostrar una web en el visor: directo si se deja, o a través del proxy del panel si no tiene HTTPS
// o si sus encabezados (X-Frame-Options, frame-ancestors) impiden mostrarla dentro de otra página.
export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = new URL(request.url).searchParams.get('url') ?? ''
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; AutogestivaPanel)' } })
    response.body?.cancel()
    const xfo = (response.headers.get('x-frame-options') ?? '').toLowerCase()
    const ancestors = (response.headers.get('content-security-policy') ?? '').toLowerCase().match(/frame-ancestors([^;]*)/)?.[1].trim()
    const blocked = /deny|sameorigin/.test(xfo) || (ancestors !== undefined && !/(^|\s)(\*|https:)(\s|$)|autogestiva\.com\.ar/.test(ancestors))
    const final = new URL(response.url || url)
    if (final.protocol === 'http:' || blocked) return NextResponse.json({ src: proxyPath(final), proxied: true })
    return NextResponse.json({ src: final.href, proxied: false })
  } catch {
    // Si no se pudo consultar: las http igual van por el proxy (el navegador las bloquearía); el resto, directo.
    const target = new URL(url)
    return target.protocol === 'http:' ? NextResponse.json({ src: proxyPath(target), proxied: true }) : NextResponse.json({ src: target.href, proxied: false })
  }
}
