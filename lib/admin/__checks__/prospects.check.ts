// Autocontrol: npx tsx lib/admin/__checks__/prospects.check.ts
import assert from 'node:assert/strict'
import { datosCliente, daysBetween, esPrimerContacto, isoIn, phoneDigits, primerMensaje, toDbRow, waLink } from '../prospects'

assert.equal(phoneDigits('+54 9 351 342-0260'), '3513420260')
assert.equal(phoneDigits('+54 351 460-1175'), '3514601175')
assert.equal(phoneDigits('0351 15 512-3456'), '3515123456')
assert.equal(phoneDigits('011 15 5124-2585'), '1151242585')
assert.equal(phoneDigits('03514601175'), '3514601175')
assert.equal(phoneDigits('3517608037'), '3517608037')
assert.equal(phoneDigits('7292973'), '7292973')
assert.equal(phoneDigits('+54 351 524 3700;+543468471705'), '3515243700')
assert.equal(phoneDigits('3516435666 543516435666'), '3516435666')
assert.equal(waLink('7292973'), '')
assert.equal(waLink('3517608037', 'hola'), 'https://wa.me/5493517608037?text=hola')

assert.deepEqual(toDbRow({ estado: 'Cliente', whatsapp: '+54 9 351 342-0260' }), { row: { estado: 'Cliente', whatsapp: '3513420260' } })
assert.ok('error' in toDbRow({ estado: 'Cualquiera' }))
assert.ok('error' in toDbRow({ negocio: '  ' }))
assert.ok('error' in toDbRow({ proximoFecha: '14/12/2026' }))
assert.deepEqual(toDbRow({ producto: 'Inventado', rubro: '' }), { row: { producto: 'Otro', rubro: null } })

assert.equal(isoIn(1, new Date(2026, 11, 31)), '2027-01-01')
assert.equal(daysBetween('2026-11-26', '2026-12-03'), 7)
const base = { negocio: 'PROIL', producto: 'Rediseño web', contacto: '', web: '', demo: 'https://proil-demo.vercel.app' }
const texto = primerMensaje(base)
assert.ok(texto.startsWith('Mucho gusto 🤝\nSoy Gabriel') && texto.endsWith('¡Saludos! 🙌'))
assert.ok(texto.includes('el trabajo de PROIL') && texto.includes('rediseño para su página web *sin costo*') && texto.includes('👉 https://proil-demo.vercel.app\n'))
assert.ok(primerMensaje({ ...base, producto: 'Carta digital' }).includes('propuesta de carta digital para su local *sin costo*'))
assert.ok(!primerMensaje({ ...base, demo: '' }).includes('👉'))
assert.equal(decodeURIComponent(waLink('3517608037', texto).split('?text=')[1]), texto)
assert.ok(esPrimerContacto({ estado: 'Demo lista', fechaContacto: '' }))
assert.ok(!esPrimerContacto({ estado: 'Prospecto', fechaContacto: '2026-11-20' }))
assert.ok(!esPrimerContacto({ estado: 'Contactado', fechaContacto: '' }))
const alta = { negocio: 'PROIL', contacto: 'Ana María Pérez', producto: 'Rediseño web', email: 'a@proil.com', whatsapp: '3515123456', web: 'http://www.proil.com.ar/inicio' }
assert.deepEqual(datosCliente(alta), { nombre: 'Ana', apellido: 'María Pérez', empresa: 'PROIL', producto: 'Rediseño web', mail: 'a@proil.com', telefono: '3515123456', dominio: 'proil.com.ar' })
assert.equal(datosCliente({ ...alta, web: 'https://instagram.com/proil' }).dominio, '')
assert.equal(datosCliente({ ...alta, web: '@proil' }).dominio, '')
assert.equal(datosCliente({ ...alta, producto: 'Carta digital', contacto: '' }).dominio, '')
assert.equal(datosCliente({ ...alta, contacto: '', producto: 'Otro' }).nombre + datosCliente({ ...alta, producto: 'Otro' }).producto, '')
console.log('prospects ok')
