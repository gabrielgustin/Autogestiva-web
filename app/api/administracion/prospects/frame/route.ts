import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/admin-session'

export const dynamic = 'force-dynamic'

// Dice si una web se deja mostrar dentro del panel (iframe), leyendo sus encabezados X-Frame-Options y frame-ancestors.
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
    return NextResponse.json({ embeddable: !blocked, finalUrl: response.url })
  } catch {
    // Si no se pudo consultar, que lo intente el navegador.
    return NextResponse.json({ embeddable: true, finalUrl: url })
  }
}
