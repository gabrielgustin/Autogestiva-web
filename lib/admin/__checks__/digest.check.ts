// Autocontrol: npx tsx lib/admin/__checks__/digest.check.ts
import assert from 'node:assert/strict'
import { resumenTexto } from '../digest'

const cero = { seguimientos: 0, pendientes: 0, cobros: 0, dominios: 0, suscripciones: 0 }
assert.equal(resumenTexto(cero), null)
assert.equal(resumenTexto({ ...cero, seguimientos: 1, cobros: 3 }), '1 seguimiento de ventas · 3 cobros vencidos')
assert.equal(resumenTexto({ ...cero, pendientes: 2, dominios: 1 }), '2 pendientes de clientes · 1 dominio por vencer')
console.log('digest ok')
