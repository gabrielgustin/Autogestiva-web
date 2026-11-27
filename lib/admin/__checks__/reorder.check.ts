// Autocontrol: npx tsx lib/admin/__checks__/reorder.check.ts
import assert from 'node:assert/strict'
import { reorder } from '../reorder'

const list = ['a', 'b', 'c', 'd']
const move = (key: string, target: string, after: boolean) => reorder(list, (x) => x, key, target, after)
assert.deepEqual(move('a', 'c', true), ['b', 'c', 'a', 'd'])
assert.deepEqual(move('d', 'a', false), ['d', 'a', 'b', 'c'])
assert.deepEqual(move('c', 'b', false), ['a', 'c', 'b', 'd'])
assert.equal(move('a', 'b', false), list)
assert.equal(move('b', 'a', true), list)
assert.equal(move('a', 'a', true), list)
assert.equal(move('x', 'a', true), list)
assert.equal(move('a', 'x', true), list)
console.log('reorder ok')
