import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'

export const dynamic = 'force-dynamic'

// Dólar tarjeta (lo que cuesta pagar Neon con la tarjeta), de dolarapi.com; se consulta como mucho cada 6 horas.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/tarjeta', { next: { revalidate: 21600 } })
    const body = await response.json()
    if (!response.ok || typeof body?.venta !== 'number') throw new Error(`status ${response.status}`)
    return NextResponse.json({ venta: body.venta, fecha: body.fechaActualizacion ?? null })
  } catch (error) {
    console.error('[admin] dolar failed:', error)
    return NextResponse.json({ error: 'No se pudo leer la cotización del dólar' }, { status: 502 })
  }
}
