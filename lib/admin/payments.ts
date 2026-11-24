// Próximo vencimiento a partir del último pago. Débito automático: siempre el día 10 (si ya pasó el 10, el del mes siguiente).
// El resto suma 1, 6 o 12 meses y, si el día no existe en ese mes (31/02), usa el último día.
export function nextPaymentDate(method: string, lastPayment: string) {
  if (!chargesPeriodically(method) || !/^\d{4}-\d{2}-\d{2}$/.test(lastPayment)) return ''
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

// Sin método (vacío o "Ninguno") no hay cobro periódico: no hay próximo vencimiento ni aviso.
export const chargesPeriodically = (method: string) => !!method.trim() && method !== 'Ninguno'

// Solo los servicios en débito automático los cubre la suscripción de Mercado Pago de su empresa.
export const isAutoDebit = (method: string) => method === 'Débito Automático'

// Vencimiento vigente: el guardado en la base, corrido de a un período mientras un cobro confirmado (Mercado Pago) lo cubra.
// Un cobro cubre el vencimiento si cae en su mismo mes o después (cobró el 2 y vence el 10: cubierto).
// Ej.: guardado 10/11, Mercado Pago cobró el 12/11 → vigente 10/12. Sin cobro, queda el 10/11 (vencido de verdad).
export function currentDueDate(method: string, savedDue: string, paidThrough = '') {
  let due = savedDue
  for (let i = 0; i < 36 && due && paidThrough && paidThrough >= `${due.slice(0, 8)}01`; i++) due = nextPaymentDate(method, due)
  return due
}

// Fecha local AAAA-MM-DD (toISOString usaría UTC y podría correr el día).
function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
