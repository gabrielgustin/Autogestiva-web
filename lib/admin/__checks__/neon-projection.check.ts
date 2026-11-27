// Autocontrol: npx tsx lib/admin/__checks__/neon-projection.check.ts
import assert from 'node:assert/strict'
import { awakeHours, projectMonth } from '../neon-projection'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
// 30 días, hoy 11: días 1 a 3 a $0, días 4 a 10 a $1 (7 días) y hoy parcial: 7 hechos + 1/día x 20 restantes.
const daily = [...Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(i + 4).padStart(2, '0')}`, cost: 1 })), { date: '2026-11-11', cost: 0.3 }]
near(projectMonth(daily, '2026-11-11', 30, 7.3), 7 + 20)
// Día sin consumo dentro de la ventana cuenta como 0.
near(projectMonth([{ date: '2026-11-09', cost: 1.4 }], '2026-11-11', 30, 1.4), 1.4 + (1.4 / 7) * 20)
// El primer día del mes no hay días completos: queda lo gastado.
near(projectMonth([{ date: '2026-11-01', cost: 0.2 }], '2026-11-01', 30, 0.2), 0.2)
// Día 3: ventana de 2 días.
near(projectMonth([{ date: '2026-11-01', cost: 1 }, { date: '2026-11-02', cost: 3 }], '2026-11-03', 30, 4.5), 4 + 2 * 28)
assert.equal(awakeHours(2.5, 0.25), 10)
assert.equal(awakeHours(1, 0), 0)
console.log('neon-projection ok')
