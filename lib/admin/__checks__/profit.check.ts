// Autocontrol: npx tsx lib/admin/__checks__/profit.check.ts
import assert from 'node:assert/strict'
import { planAmount, profitByClient } from '../profit'

assert.equal(planAmount('$300.000'), 300000)
assert.equal(planAmount('-'), 0)
const rows = profitByClient(
  [
    { key: 'jb', nombre: 'Jara Bus', members: [{ plan: '$20.000', neonProyecto: 'flat' }, { plan: '$20.000', neonProyecto: 'flat' }] },
    { key: 'lg', nombre: 'Life Gym', members: [{ plan: '$10.000', neonProyecto: '' }] },
    { key: 'x', nombre: 'Caro', members: [{ plan: '$1.000', neonProyecto: 'caro' }] },
  ],
  { flat: 8, caro: 2 },
  1500,
)
assert.deepEqual(rows.map((r) => [r.nombre, r.ingreso, r.costoArs, r.ganancia]), [['Caro', 1000, 3000, -2000], ['Life Gym', 10000, 0, 10000], ['Jara Bus', 40000, 12000, 28000]])
assert.deepEqual(rows[2].bases, ['flat'])
console.log('profit ok')
