// Piezas compartidas por la API, la pantalla de prospectos y el script de importación (sin dependencias de servidor ni imports).

export const ESTADOS = ['Prospecto', 'Demo lista', 'Contactado', 'Esperando respuesta', 'Interesado', 'Reunión agendada', 'Presupuesto enviado', 'Cliente', 'Rechazado', 'En pausa'] as const
export type Estado = (typeof ESTADOS)[number]

// Estados que cuentan como conversación abierta (ya se habló, todavía no hay respuesta final).
export const EN_CURSO: readonly Estado[] = ['Contactado', 'Esperando respuesta', 'Interesado', 'Reunión agendada', 'Presupuesto enviado']

export const PRODUCTOS = ['Rediseño web', 'Carta digital', 'Landing web', 'Web + panel', 'Juegos para eventos', 'Web', 'Otro']

export const ESTADO_TONE: Record<Estado, 'gray' | 'blue' | 'orange' | 'amber' | 'green' | 'red'> = {
  Prospecto: 'gray',
  'Demo lista': 'blue',
  Contactado: 'amber',
  'Esperando respuesta': 'amber',
  Interesado: 'orange',
  'Reunión agendada': 'orange',
  'Presupuesto enviado': 'orange',
  Cliente: 'green',
  Rechazado: 'red',
  'En pausa': 'gray',
}

export type Prospect = {
  id: string
  negocio: string
  producto: string
  rubro: string
  contacto: string
  whatsapp: string
  email: string
  instagram: string
  web: string
  demo: string
  ciudad: string
  motivo: string
  estado: Estado
  seguimiento: string
  fechaContacto: string
  proximoPaso: string
  proximoFecha: string
  notas: string
  origen: string
  creado: string
}

export type ProspectEvent = { id: string; tipo: string; texto: string; fecha: string }

// Campo de la pantalla → columna de la base. Solo estos campos se pueden escribir desde la API.
export const FIELDS = {
  negocio: 'negocio', producto: 'producto', rubro: 'rubro', contacto: 'contacto', whatsapp: 'whatsapp', email: 'email',
  instagram: 'instagram', web: 'web', demo: 'demo', ciudad: 'ciudad', motivo: 'motivo', estado: 'estado', seguimiento: 'seguimiento',
  fechaContacto: 'fecha_contacto', proximoPaso: 'proximo_paso', proximoFecha: 'proximo_fecha', notas: 'notas',
} as const

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LONG = new Set(['notas', 'motivo'])

// Número argentino a 10 dígitos (característica + número), sin +54, 9, 0 ni 15. Si no se reconoce, quedan los dígitos tal cual.
// Con varios números ("351 524 3700; 3468 471705") se queda con el primero.
export function phoneDigits(raw: string) {
  const first = raw.split(/[;,/]/)[0]
  let d = first.replace(/\D/g, '')
  if (d.length > 13) d = first.trim().split(/\s+/)[0].replace(/\D/g, '')
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2)
  if (d.length === 11 && d.startsWith('9')) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) for (const i of [2, 3, 4]) if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break }
  return d
}

export function waLink(phone: string, text = '') {
  const d = phoneDigits(phone)
  if (d.length !== 10) return ''
  return `https://wa.me/549${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// Partial row for the DB from a form: only the keys present are validated and returned.
export function toDbRow(input: Record<string, unknown>): { row: Record<string, string | null> } | { error: string } {
  const row: Record<string, string | null> = {}
  for (const [key, column] of Object.entries(FIELDS)) {
    if (!(key in input)) continue
    const raw = input[key]
    let value = typeof raw === 'string' ? raw.trim().slice(0, LONG.has(key) ? 4000 : 300) : ''
    if (key === 'negocio' && !value) return { error: 'El nombre del negocio es obligatorio' }
    if (key === 'estado' && !(ESTADOS as readonly string[]).includes(value)) return { error: 'Estado inválido' }
    if (key === 'producto' && !PRODUCTOS.includes(value)) value = 'Otro'
    if ((key === 'fechaContacto' || key === 'proximoFecha') && value && !DATE_RE.test(value)) return { error: 'Las fechas deben tener formato AAAA-MM-DD' }
    if (key === 'whatsapp') value = phoneDigits(value)
    row[column] = value || null
  }
  return { row }
}

export function normalizeText(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Fecha local AAAA-MM-DD, corrida `days` días desde hoy.
export function isoIn(days = 0, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00`) - Date.parse(`${fromIso}T12:00:00`)) / 86_400_000)
}

// Primer mensaje de WhatsApp: si ya hay demo la manda; si no, ofrece armarla.
export function primerMensaje(p: Pick<Prospect, 'negocio' | 'producto' | 'contacto' | 'demo' | 'web'>) {
  const saludo = p.contacto ? `¡Hola ${p.contacto.split(' ')[0]}! ¿Cómo estás?` : '¡Hola! ¿Cómo están?'
  const que = p.producto === 'Carta digital' ? 'una carta digital' : p.producto === 'Juegos para eventos' ? 'juegos para sus eventos' : 'una web nueva'
  if (p.demo) {
    return `${saludo} Soy Gabriel, de Autogestiva. Les preparé sin compromiso ${que} para ${p.negocio}, para que vean cómo podría quedar:\n${p.demo}\n\nSe ve bien en el celular y la pueden recorrer como si ya estuviera publicada. ¿La miran y me cuentan qué les parece?`
  }
  return `${saludo} Soy Gabriel, de Autogestiva. Estuve mirando ${p.web ? 'la web' : 'la presencia online'} de ${p.negocio} y se me ocurrieron algunas mejoras. ¿Les interesa que les arme, sin cargo, una propuesta de ${que} para que la vean funcionando?`
}

// Mensaje para retomar una conversación ya empezada.
export function mensajeSeguimiento(p: Pick<Prospect, 'negocio' | 'producto' | 'contacto' | 'demo'>) {
  const saludo = p.contacto ? `¡Hola ${p.contacto.split(' ')[0]}!` : '¡Hola!'
  const que = p.producto === 'Carta digital' ? 'la carta digital' : 'la propuesta'
  return `${saludo} ¿Cómo va? Te escribo por ${que} que les preparé para ${p.negocio}${p.demo ? ` (${p.demo})` : ''}. ¿Pudieron verla? Si quieren cambiar algo o tienen dudas, lo vemos sin problema.`
}
