import { MP_PAYER_TO_EMPRESA } from '@/lib/admin/mercadopago-links'

// Suscripciones de Mercado Pago con su historial de cobros. `pagos` = último cobro procesado por empresa (YYYY-MM-DD).
// La usan la ruta del panel y el resumen diario; con `ok: false` Mercado Pago rechazó la consulta.
export async function readMercadoPago(token: string) {
  const response = await fetch('https://api.mercadopago.com/preapproval/search?limit=100', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok) return { ok: false as const, status: response.status, detail: (body?.message as string | undefined) ?? null }

  const results: Record<string, any>[] = body?.results ?? []
  // Historial de cobros de las suscripciones activas (la lista no trae qué se cobró ni cuándo).
  const cobros = await Promise.all(
    results.filter((item) => item.status === 'authorized').map(async (item) => {
      const r = await fetch(`https://api.mercadopago.com/authorized_payments/search?preapproval_id=${item.id}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await r.json().catch(() => null)
      return [item.id, (data?.results ?? []).map((c: Record<string, any>) => ({ estado: c.status, monto: c.transaction_amount, fechaDebito: c.debit_date, creado: c.date_created, reintentos: c.retry_attempt }))] as const
    }),
  )
  const historial = Object.fromEntries(cobros)
  const pagos: Record<string, string> = {}
  const suscriptos = new Set<string>()
  for (const item of results) {
    const empresa = item.status === 'authorized' ? MP_PAYER_TO_EMPRESA[[item.payer_first_name, item.payer_last_name].filter(Boolean).join(' ')] : undefined
    if (!empresa) continue
    suscriptos.add(empresa)
    for (const cobro of historial[item.id] ?? []) {
      const day = String(cobro.fechaDebito ?? '').slice(0, 10)
      if (cobro.estado === 'processed' && day > (pagos[empresa] ?? '')) pagos[empresa] = day
    }
  }
  return { ok: true as const, body, results, historial, pagos, suscriptos }
}
