import { rewrite, targetFrom } from '@/lib/admin/site-proxy'

export const dynamic = 'force-dynamic'

// Sirve una web ajena para el visor del panel (ver lib/admin/site-proxy.ts).
export async function GET(request: Request) {
  const target = targetFrom(request.url)
  if (!target) return new Response('No autorizado', { status: 403 })
  let upstream: Response
  try {
    upstream = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', accept: request.headers.get('accept') ?? '*/*' } })
  } catch {
    return new Response('<p style="font:14px sans-serif;padding:24px">No se pudo abrir esta web desde el panel. Probá con «Abrir en pestaña nueva».</p>', { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  const type = upstream.headers.get('content-type') ?? ''
  const headers = {
    'content-type': type || 'application/octet-stream',
    'cache-control': 'private, max-age=600',
    // The proxied page is served from the panel's own domain, so it must not run any script (it could call the panel API
    // with the admin's cookies). CSP 'sandbox' would isolate it too, but embedded browsers block sandboxed frames' loads.
    'content-security-policy': "script-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'",
    'x-robots-tag': 'noindex',
  }
  const isHtml = type.includes('text/html')
  if (!isHtml && !type.includes('text/css')) return new Response(upstream.body, { status: upstream.status, headers })
  // latin1 keeps the original bytes as they are, whatever the page's charset; only ASCII URLs are touched.
  const text = Buffer.from(await upstream.arrayBuffer()).toString('latin1')
  return new Response(Buffer.from(rewrite(text, new URL(upstream.url || target.href), !isHtml), 'latin1'), { status: upstream.status, headers })
}
