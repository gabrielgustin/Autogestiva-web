// Autocontrol: npx tsx lib/admin/__checks__/payments.check.ts
import assert from 'node:assert/strict'
import { nextPaymentDate } from '../payments'
import { buildClientAlerts } from '../client-alerts'

assert.equal(nextPaymentDate('Débito Automático', '2026-11-24'), '2026-12-10')
assert.equal(nextPaymentDate('Débito Automático', '2026-11-05'), '2026-11-10')
assert.equal(nextPaymentDate('Débito Automático', '2026-12-15'), '2027-01-10')
assert.equal(nextPaymentDate('Pago mensual', '2026-01-31'), '2026-02-28')
assert.equal(nextPaymentDate('Pago semestral', '2026-08-31'), '2027-02-28')
assert.equal(nextPaymentDate('Pago anual', '2024-02-29'), '2025-02-28')
assert.equal(nextPaymentDate('Pago mensual', ''), '')

const client = (empresa: string, proximoPago: string) => ({ row: empresa, nombre: 'A', apellido: 'B', empresa, producto: 'Web', dominio: '', dominioVencimiento: '', mail: '', telefono: '', servidor: '', baseDatos: '', plan: '$10.000', metodoPago: '', ultimoPago: '', proximoPago })
const today = new Date(2026, 10, 24)
const alerts = buildClientAlerts([client('Life Gym', '2026-11-10'), client('CTP', '2026-11-10'), client('Lejos', '2027-03-01')], today, { 'Life Gym': '2026-11-12' })
assert.deepEqual(alerts.map((a) => a.cliente), ['CTP'])
assert.equal(alerts[0].days, -14)
assert.equal(buildClientAlerts([client('Life Gym', '2026-11-10')], today, { 'Life Gym': '2026-10-12' }).length, 1)
// Cobro antes del día de vencimiento pero en el mismo mes (Pipet Labor: cobró el 2, vence el 10): cubierto.
assert.equal(buildClientAlerts([client('Pipet Labor', '2026-11-10')], today, { 'Pipet Labor': '2026-11-02' }).length, 0)
// Cobro del mes anterior: no cubre.
assert.equal(buildClientAlerts([client('Pipet Labor', '2026-11-10')], today, { 'Pipet Labor': '2026-10-30' }).length, 1)
console.log('payments.check ok')
