import { safeEqual, sign } from '@/lib/admin/admin-session'

// Visor de webs del panel: las páginas sin HTTPS (o que no se dejan mostrar dentro de otra) se piden desde el servidor
// y se sirven bajo /ver/<firma>/<esquema>/<host>/<ruta>. La firma la genera solo el panel (con sesión), así este
// camino no queda como proxy abierto; y como cada respuesta va sin JavaScript (CSP), la web ajena no puede tocar el panel.
export const PROXY_PREFIX = '/api/administracion/prospects/ver'

const signature = (origin: string) => sign(`ver:${origin}`).slice(0, 22)

export function proxyPath(target: URL) {
  const origin = `${target.protocol.replace(':', '')}/${target.host}`
  return `${PROXY_PREFIX}/${signature(origin)}/${origin}${target.pathname}${target.search}`
}

// De la ruta pedida al proxy, la URL original; null si la firma no corresponde.
export function targetFrom(requestUrl: string) {
  const url = new URL(requestUrl)
  const [sig, scheme, host, ...rest] = url.pathname.slice(PROXY_PREFIX.length + 1).split('/')
  if (!sig || !host || (scheme !== 'http' && scheme !== 'https')) return null
  if (!safeEqual(sig, signature(`${scheme}/${host}`))) return null
  return new URL(`${scheme}://${host}/${rest.join('/')}${url.search}`)
}

const SKIP = /^(#|data:|javascript:|mailto:|tel:|about:|blob:)/i

// Reescribe los enlaces de un HTML o CSS para que lo de la misma web (y todo lo que sea http) pase por el proxy.
export function rewrite(text: string, base: URL, css: boolean) {
  const fix = (raw: string) => {
    const value = raw.trim().replace(/&amp;/g, '&')
    if (!value || SKIP.test(value)) return raw
    let url: URL
    try { url = new URL(value, base) } catch { return raw }
    return url.protocol === 'http:' || url.origin === base.origin ? proxyPath(url) : url.href
  }
  let out = text.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_, q, v) => `url(${q}${fix(v)}${q})`)
  if (!css) out = out.replace(/(\s(?:src|href|action|poster|background|data-src)\s*=\s*)(["'])([^"']*)\2/gi, (_, attr, q, v) => `${attr}${q}${fix(v)}${q}`)
  return out
}
