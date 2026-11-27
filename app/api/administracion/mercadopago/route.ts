import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { readMercadoPago } from '@/lib/admin/mercadopago'

export const dynamic = 'force-dynamic'

// Solo lectura y solo admin. `pagos` = último cobro procesado por empresa (YYYY-MM-DD); el resto es detalle para revisar.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Falta MP_ACCESS_TOKEN en Vercel (o falta un deploy nuevo)' }, { status: 503 })

  const mp = await readMercadoPago(token)
  if (!mp.ok) return NextResponse.json({ error: 'Mercado Pago rechazó la consulta', status: mp.status, detail: mp.detail }, { status: 502 })
  const { body, results, historial, pagos, suscriptos } = mp
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
