// Crea las tablas (db/schema.sql) e importa prospectos desde el JSON que genera prospectos-rediseno/6_exportar_app.py.
// Uso: node --env-file=.env.local db/importar-prospectos.mjs ../prospectos-rediseno/prospectos_app.json
// Se puede correr de nuevo: los negocios que ya están (mismo nombre) se saltean.
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { toDbRow } from '../lib/admin/prospects.ts'

const file = process.argv[2]
if (!file || !process.env.DATABASE_URL) {
  console.error('Falta el JSON o DATABASE_URL')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
for (const statement of schema.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(statement)

const records = JSON.parse(readFileSync(file, 'utf8'))
let added = 0
const skipped = []
for (const { origen, creado, evento, ...fields } of records) {
  const parsed = toDbRow(fields)
  if ('error' in parsed) { skipped.push(`${fields.negocio} (${parsed.error})`); continue }
  const columns = Object.keys(parsed.row)
  const [row] = await sql.query(
    `insert into prospects (${columns.join(', ')}, origen, created_at)
     values (${columns.map((_, i) => `$${i + 1}`).join(', ')}, $${columns.length + 1}, coalesce($${columns.length + 2}::date, now()))
     on conflict ((lower(negocio))) do nothing returning id`,
    [...Object.values(parsed.row), origen, creado || null],
  )
  if (!row) { skipped.push(`${fields.negocio} (repetido)`); continue }
  added++
  const at = parsed.row.fecha_contacto || creado || null
  await sql.query(`insert into prospect_events (prospect_id, tipo, texto, created_at) values ($1, 'Importado', $2, coalesce($3::date::timestamp at time zone 'America/Argentina/Cordoba', now()))`, [row.id, `Desde la hoja «${origen}» del Excel${evento ? `. ${evento}` : ''}`, at])
}
console.log(`Importados: ${added}. Salteados: ${skipped.length}`)
if (skipped.length) console.log(skipped.join('\n'))
