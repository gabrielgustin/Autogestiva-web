// Próximo vencimiento a partir del último pago. Débito automático: siempre el día 10 (si ya pasó el 10, el del mes siguiente).
// El resto suma 1, 6 o 12 meses y, si el día no existe en ese mes (31/02), usa el último día.
export function nextPaymentDate(method: string, lastPayment: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastPayment)) return ''
  const date = new Date(`${lastPayment}T12:00:00`)
  if (method === 'Débito Automático') {
    const next = new Date(date)
    next.setMonth(next.getMonth() + (date.getDate() >= 10 ? 1 : 0), 10)
    return iso(next)
  }
  const months = method === 'Pago semestral' ? 6 : method === 'Pago anual' ? 12 : 1
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()))
  return iso(date)
}

// Fecha local AAAA-MM-DD (toISOString usaría UTC y podría correr el día).
function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
