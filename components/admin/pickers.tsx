'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Selectores con el lenguaje visual de la web, en lugar de los nativos del navegador (que cambian según el sistema).

const trigger =
  'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 text-left text-sm text-ink outline-none transition-shadow hover:border-ink/25 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/10 data-[state=open]:border-brand data-[state=open]:ring-4 data-[state=open]:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'z-[80] rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-20px_rgba(11,19,34,0.35)] animate-in fade-in-0 zoom-in-95'

type Option = string | { value: string; label: string }
const optionValue = (option: Option) => (typeof option === 'string' ? option : option.value)
const optionLabel = (option: Option) => (typeof option === 'string' ? option : option.label)

// Radix no admite un ítem con valor vacío: el vacío se muestra como placeholder.
export function SelectField({ value, onChange, options, placeholder = 'Elegí una opción', ariaLabel, disabled, className }: { value: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; ariaLabel?: string; disabled?: boolean; className?: string }) {
  return (
    <Select.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger aria-label={ariaLabel} className={cn(trigger, className)}>
        <span className="truncate"><Select.Value placeholder={<span className="text-ink/40">{placeholder}</span>} /></span>
        <Select.Icon><ChevronDown className="size-4 shrink-0 text-ink/50" aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={6} className={`${panel} max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden`}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item key={optionValue(option)} value={optionValue(option)} className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm text-ink outline-none data-[highlighted]:bg-paper data-[state=checked]:font-semibold">
                <Select.ItemText>{optionLabel(option)}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2.5"><Check className="size-4 text-brand" aria-hidden="true" /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}
const navButton = 'inline-flex size-8 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

// Calendario de un mes, lunes primero. Las flechas dobles saltan un año (útil para vencimientos de dominio).
function MonthGrid({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  const selected = parseIso(value)
  const today = toIso(new Date())
  const [view, setView] = useState(() => {
    const base = selected ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const shift = (months: number) => setView((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))
  const start = new Date(view.getFullYear(), view.getMonth(), 1 - ((view.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))

  return (
    <div className="w-[284px] p-1">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex">
          <button type="button" onClick={() => shift(-12)} className={navButton} aria-label="Año anterior"><ChevronsLeft className="size-4" /></button>
          <button type="button" onClick={() => shift(-1)} className={navButton} aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
        </div>
        <p className="font-display text-[15px] font-bold capitalize tracking-tight">{MONTHS[view.getMonth()]} {view.getFullYear()}</p>
        <div className="flex">
          <button type="button" onClick={() => shift(1)} className={navButton} aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
          <button type="button" onClick={() => shift(12)} className={navButton} aria-label="Año siguiente"><ChevronsRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEK.map((day, i) => <div key={i} className="eyebrow py-1.5 text-[10px] text-muted-ink">{day}</div>)}
        {days.map((day) => {
          const iso = toIso(day)
          const isSelected = value === iso
          const outside = day.getMonth() !== view.getMonth()
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-label={day.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                isSelected ? 'bg-ink font-semibold text-white' : iso === today ? 'font-semibold text-brand ring-1 ring-inset ring-brand/40 hover:bg-brand-light' : outside ? 'text-ink/30 hover:bg-paper' : 'text-ink hover:bg-paper'
              }`}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || ''
}

export function DateField({ value, onChange, ariaLabel, placeholder = 'Elegí una fecha' }: { value: string; onChange: (value: string) => void; ariaLabel?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const pick = (iso: string) => { onChange(iso); setOpen(false) }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger type="button" aria-label={ariaLabel} className={trigger}>
        <span className={value ? '' : 'text-ink/40'}>{value ? formatDate(value) : placeholder}</span>
        <CalendarDays className="size-4 shrink-0 text-ink/50" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={panel}>
          <MonthGrid value={value} onSelect={pick} />
          <div className="mt-1 flex items-center justify-between border-t border-line px-1 pt-2">
            <button type="button" onClick={() => pick('')} className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-ink hover:bg-paper hover:text-ink">Borrar</button>
            <button type="button" onClick={() => pick(toIso(new Date()))} className="rounded-full px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light">Hoy</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// Mes y año (AAAA-MM). `max` deshabilita los meses posteriores.
export function MonthField({ value, onChange, max, ariaLabel }: { value: string; onChange: (value: string) => void; max?: string; ariaLabel?: string }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear())
  const maxYear = max ? Number(max.slice(0, 4)) : Infinity
  const [y, m] = value.split('-').map(Number)
  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) setYear(y || new Date().getFullYear()) }}>
      <Popover.Trigger type="button" aria-label={ariaLabel} className={`${trigger} h-10 w-auto rounded-full px-4`}>
        <span className="capitalize">{y && m ? `${MONTHS[m - 1]} ${y}` : 'Elegí un mes'}</span>
        <CalendarDays className="size-4 shrink-0 text-ink/50" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={12} className={`${panel} w-[264px]`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <button type="button" onClick={() => setYear(year - 1)} className={navButton} aria-label="Año anterior"><ChevronLeft className="size-4" /></button>
            <p className="font-display text-[15px] font-bold tracking-tight">{year}</p>
            <button type="button" onClick={() => setYear(year + 1)} disabled={year >= maxYear} className={`${navButton} disabled:opacity-30`} aria-label="Año siguiente"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((name, i) => {
              const iso = `${year}-${pad(i + 1)}`
              const disabled = !!max && iso > max
              const active = iso === value
              return (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(iso); setOpen(false) }}
                  className={`rounded-xl py-2.5 text-sm capitalize transition-colors disabled:opacity-30 ${active ? 'bg-ink font-semibold text-white' : 'text-ink hover:bg-paper'}`}
                >
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
