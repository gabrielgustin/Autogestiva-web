// Texto del resumen diario que llega al celular. Sin nada para hacer no se manda.
export type Counts = { seguimientos: number; pendientes: number; cobros: number; dominios: number; suscripciones: number }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function resumenTexto(c: Counts): string | null {
  const partes = [
    c.seguimientos && plural(c.seguimientos, 'seguimiento de ventas', 'seguimientos de ventas'),
    c.pendientes && plural(c.pendientes, 'pendiente de clientes', 'pendientes de clientes'),
    c.cobros && plural(c.cobros, 'cobro vencido', 'cobros vencidos'),
    c.dominios && plural(c.dominios, 'dominio por vencer', 'dominios por vencer'),
    c.suscripciones && plural(c.suscripciones, 'link de suscripción para mandar', 'links de suscripción para mandar'),
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}
