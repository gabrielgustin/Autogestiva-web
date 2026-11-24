import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { MP_PAYER_TO_EMPRESA } from '@/lib/admin/mercadopago-links'

export const dynamic = 'force-dynamic'

// Solo lectura y solo admin. `pagos` = último cobro procesado por empresa (YYYY-MM-DD); el resto es detalle para revisar.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Falta MP_ACCESS_TOKEN en Vercel (o falta un deploy nuevo)' }, { status: 503 })

  const response = await fetch('https://api.mercadopago.com/preapproval/search?limit=100', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok) return NextResponse.json({ error: 'Mercado Pago rechazó la consulta', status: response.status, detail: body?.message ?? null }, { status: 502 })

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
  return NextResponse.json({
    pagos,
    suscriptos: [...suscriptos],
    total: body?.paging?.total ?? results.length,
    porEstado: results.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {}),
    campos: results[0] ? Object.keys(results[0]) : [],
    suscripciones: results.map((item) => ({
      nombre: [item.payer_first_name, item.payer_last_name].filter(Boolean).join(' ') || null,
      referencia: item.external_reference ?? null,
      cobros: historial[item.id] ?? null,
      estado: item.status,
      motivo: item.reason,
      monto: item.auto_recurring?.transaction_amount ?? null,
      proximoCobro: item.next_payment_date ?? null,
      ultimaModificacion: item.last_modified ?? null,
    })),
  })
}
