'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Check, Copy, KeyRound, RefreshCw, Search } from 'lucide-react'
import { SelectField } from '@/components/admin/pickers'

type TableRef = { name: string; schema: string }
type GridColumn = { name: string; type: string; nullable: boolean; primary_key: boolean }
type RowsResponse = { columns: GridColumn[]; rows: Record<string, string | null>[]; total: number; page: number; pageSize: number; error?: string }

const fetcher = async (url: string): Promise<RowsResponse> => {
  const response = await fetch(url)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudieron leer los registros')
  return result
}

export function DataGrid({ projectId, tables }: { projectId: string; tables: TableRef[] }) {
  const [tableKey, setTableKey] = useState(() => (tables[0] ? `${tables[0].schema}.${tables[0].name}` : ''))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const selected = tables.find((table) => `${table.schema}.${table.name}` === tableKey)
  const url = selected
    ? `/api/administracion/neon/rows?${new URLSearchParams({
        projectId,
        schema: selected.schema,
        table: selected.name,
        page: String(page),
        pageSize: String(pageSize),
        ...(sort ? { sort: sort.column, dir: sort.dir } : {}),
        ...(search ? { q: search } : {}),
      })}`
    : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(url, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  function changeTable(key: string) {
    setTableKey(key)
    setPage(1)
    setSort(null)
    setSearch('')
    setSearchInput('')
  }

  function toggleSort(column: string) {
    setPage(1)
    setSort((current) => {
      if (current?.column !== column) return { column, dir: 'asc' }
      if (current.dir === 'asc') return { column, dir: 'desc' }
      return null
    })
  }

  async function copyData() {
    if (!data) return
    const header = data.columns.map((column) => column.name).join('\t')
    const body = data.rows.map((row) => data.columns.map((column) => row[column.name] ?? '').join('\t')).join('\n')
    await navigator.clipboard.writeText(`${header}\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (tables.length === 0) {
    return <div className="rounded-2xl border border-line bg-white p-6 text-sm text-muted-ink">Esta base no tiene tablas para mostrar.</div>
  }

  return (
    <section aria-label="Registros de la tabla" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:items-center md:p-4">
        <div className="font-mono md:w-72">
          <SelectField
            ariaLabel="Tabla"
            value={tableKey}
            onChange={changeTable}
            options={tables.map((table) => ({ value: `${table.schema}.${table.name}`, label: table.schema === 'public' ? table.name : `${table.schema}.${table.name}` }))}
          />
        </div>
        <form
          className="relative flex-1 md:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            setSearch(searchInput.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" aria-hidden />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar en todas las columnas (Enter)"
            aria-label="Buscar en la tabla"
            className="h-11 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </form>
        <p className="eyebrow text-[10px] text-muted-ink md:ml-auto">Solo lectura</p>
      </div>

      {error && <div className="m-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>}

      <div className="max-h-[60vh] overflow-auto">
        {isLoading && !data ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded bg-paper" />
            ))}
          </div>
        ) : data ? (
          <table className="w-full min-w-max border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-paper">
              <tr>
                {data.columns.map((column) => {
                  const active = sort?.column === column.name
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                  return (
                    <th key={column.name} scope="col" className="border-r border-b border-line p-0 last:border-r-0" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort(column.name)} className="flex w-full min-w-44 items-start justify-between gap-3 px-4 py-3 text-left hover:bg-white">
                        <span>
                          <span className="block font-mono text-sm font-semibold text-ink">{column.name}</span>
                          <span className="mt-1 flex items-center gap-1.5 font-mono text-xs font-normal text-muted-ink">
                            {column.primary_key && <KeyRound className="size-3 text-orange-600" aria-label="Clave primaria" />}
                            {!column.nullable && <span aria-label="No nulo">*</span>}
                            {column.type}
                          </span>
                        </span>
                        <Icon className={active ? 'mt-0.5 size-4 text-brand' : 'mt-0.5 size-4 text-ink/30'} aria-hidden />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className={isValidating ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={data.columns.length} className="px-4 py-10 text-center text-sm text-muted-ink">
                    {search ? 'Ningún registro coincide con la búsqueda.' : 'La tabla está vacía.'}
                  </td>
                </tr>
              ) : (
                data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-paper/60">
                    {data.columns.map((column) => {
                      const value = row[column.name]
                      return (
                        <td key={column.name} className="max-w-xs truncate border-r border-b border-line px-4 py-3 font-mono text-sm last:border-r-0" title={value ?? 'NULL'}>
                          {value === null ? <span className="text-ink/30">NULL</span> : value}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-paper/60 p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => mutate()} disabled={isValidating} aria-label="Recargar registros" className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white hover:border-ink/30 disabled:opacity-50">
            <RefreshCw className={isValidating ? 'size-4 animate-spin' : 'size-4'} />
          </button>
          <p className="text-muted-ink">
            Mostrando {from} - {to} de {data?.total ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Página anterior" className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white hover:border-ink/30 disabled:opacity-40">
            <ArrowLeft className="size-4" />
          </button>
          <span className="px-2 text-muted-ink">
            Página {page} de {totalPages}
          </span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} aria-label="Página siguiente" className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white hover:border-ink/30 disabled:opacity-40">
            <ArrowRight className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <SelectField
            ariaLabel="Filas por página"
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value))
              setPage(1)
            }}
            options={[25, 50, 100].map((size) => ({ value: String(size), label: `${size} filas` }))}
            className="h-10 w-32 rounded-full"
          />
          <button type="button" onClick={copyData} disabled={!data} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 font-semibold hover:border-ink/30 disabled:opacity-40">
            {copied ? <Check className="size-4 text-brand" /> : <Copy className="size-4" />}
            {copied ? 'Copiado' : 'Copiar datos'}
          </button>
        </div>
      </div>
    </section>
  )
}
