'use client'

// Campos de la ficha de cliente: los usan el panel de clientes y el alta desde Prospectos.
import { COLUMN_LABELS, type ClientInput } from '@/lib/admin/clients-shared'
import { chargesPeriodically, nextPaymentDate } from '@/lib/admin/payments'
import { inputClass } from '@/components/admin/ui'
import { DateField, SelectField } from '@/components/admin/pickers'

export const emptyForm: ClientInput = { nombre: '', apellido: '', empresa: '', producto: '', dominio: '', dominioVencimiento: '', mail: '', telefono: '', servidor: '', baseDatos: '', plan: '', metodoPago: '', ultimoPago: '', proximoPago: '', avisoSuscripcion: '', valorVenta: '', neonProyecto: '' }
const paymentOptions = ['Débito Automático', 'Pago mensual', 'Pago semestral', 'Pago anual', 'Ninguno']
const planOptions = ['$10.000', '$15.000', '$20.000', '$30.000', '$40.000', '$50.000']
const CUSTOM_PLAN = '__personalizado'
export const isCustomPlan = (plan: string) => !!plan && !planOptions.includes(plan)
// Los montos escritos a mano usan el mismo formato que los planes fijos: $12.500.
const formatMoney = (digits: string) => (digits ? `$${Number(digits).toLocaleString('es-AR')}` : '')

// Secciones de la ficha: qué campos van juntos y cuáles son obligatorios.
const formSections: { title: string; fields: (keyof ClientInput)[] }[] = [
  { title: 'Contacto', fields: ['nombre', 'apellido', 'empresa', 'mail', 'telefono'] },
  { title: 'Servicio', fields: ['producto', 'dominio', 'dominioVencimiento', 'valorVenta', 'servidor', 'baseDatos', 'neonProyecto'] },
  { title: 'Cobro', fields: ['plan', 'metodoPago', 'ultimoPago'] },
]
const requiredFields = new Set<keyof ClientInput>(['nombre', 'apellido', 'plan'])

// Monto en pesos: se escriben solo los números y queda guardado como $12.500.
export function MoneyInput({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const digits = value.replace(/[^0-9]/g, '')
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">$</span>
      <input aria-label={label} inputMode="numeric" autoComplete="off" autoFocus={autoFocus} placeholder={placeholder} value={digits ? Number(digits).toLocaleString('es-AR') : ''} onChange={(e) => onChange(formatMoney(e.target.value.replace(/[^0-9]/g, '').slice(0, 9)))} className={`${inputClass} pl-7`} />
    </div>
  )
}

export const missingFields = (form: ClientInput) => [...requiredFields].filter((field) => !form[field].trim()).map((field) => COLUMN_LABELS[field])

export type NeonProject = { id: string; name: string }
const NO_BASE = '__ninguna'

export function ClientFields({ form, setForm, customPlan, setCustomPlan, neonProjects = [] }: { form: ClientInput; setForm: React.Dispatch<React.SetStateAction<ClientInput>>; customPlan: boolean; setCustomPlan: (value: boolean) => void; neonProjects?: NeonProject[] }) {
  function update(field: keyof ClientInput, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      // Se sugiere el próximo pago con el método y el último pago, pero se puede fijar a mano (cliente que empieza a pagar más adelante).
      if (field === 'metodoPago' || field === 'ultimoPago') next.proximoPago = nextPaymentDate(next.metodoPago, next.ultimoPago) || (chargesPeriodically(next.metodoPago) ? next.proximoPago : '')
      return next
    })
  }

  return (
    <>
      {formSections.map((section) => (
        <fieldset key={section.title}>
          <legend className="eyebrow mb-3 text-[10px] text-muted-ink">{section.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field} className="text-xs font-semibold text-ink/70">
                {field === 'ultimoPago' ? 'Fecha del último pago' : COLUMN_LABELS[field]}
                {requiredFields.has(field) && <span className="text-orange-600"> *</span>}
                <div className="mt-1.5">
                  {field === 'plan' ? (
                    <div className="grid gap-2">
                      <SelectField
                        ariaLabel="Plan"
                        placeholder="Elegí un plan"
                        value={customPlan ? CUSTOM_PLAN : form.plan}
                        onChange={(value) => {
                          const custom = value === CUSTOM_PLAN
                          setCustomPlan(custom)
                          update('plan', custom ? (isCustomPlan(form.plan) ? form.plan : '') : value)
                        }}
                        options={[...planOptions, { value: CUSTOM_PLAN, label: 'Monto personalizado…' }]}
                      />
                      {customPlan && (
                        <MoneyInput autoFocus label="Monto personalizado del plan" placeholder="Ej.: 12.500" value={form.plan} onChange={(value) => update('plan', value)} />
                      )}
                    </div>
                  ) : field === 'valorVenta' ? (
                    <MoneyInput label="Valor de venta" placeholder="Ej.: 150.000" value={form.valorVenta} onChange={(value) => update('valorVenta', value)} />
                  ) : field === 'neonProyecto' ? (
                    // Solo la base propia de este servicio: el costo de Neon se le descuenta a este cliente.
                    <SelectField
                      ariaLabel="Base en Neon"
                      placeholder="Sin base en Neon"
                      value={form.neonProyecto}
                      onChange={(value) => update('neonProyecto', value === NO_BASE ? '' : value)}
                      options={[{ value: NO_BASE, label: 'Sin base en Neon' }, ...neonProjects.map((p) => ({ value: p.id, label: p.name })), ...(form.neonProyecto && !neonProjects.some((p) => p.id === form.neonProyecto) ? [{ value: form.neonProyecto, label: form.neonProyecto }] : [])]}
                    />
                  ) : field === 'metodoPago' ? (
                    <SelectField ariaLabel="Método de pago" placeholder="Elegí un método" value={form.metodoPago} onChange={(value) => update('metodoPago', value)} options={[...new Set([...paymentOptions, ...(form.metodoPago ? [form.metodoPago] : [])])]} />
                  ) : field === 'dominioVencimiento' || field === 'ultimoPago' ? (
                    <DateField ariaLabel={field === 'ultimoPago' ? 'Fecha del último pago' : 'Vencimiento del dominio'} value={form[field]} onChange={(value) => update(field, value)} />
                  ) : (
                    <input
                      aria-label={COLUMN_LABELS[field]}
                      type={field === 'mail' ? 'email' : field === 'telefono' ? 'tel' : 'text'}
                      autoComplete="off"
                      value={form[field]}
                      onChange={(e) => update(field, e.target.value)}
                      className={inputClass}
                    />
                  )}
                </div>
              </div>
            ))}
            {section.title === 'Cobro' && (
              <div className="text-xs font-semibold text-ink/70">
                Fecha del próximo pago
                <div className="mt-1.5 font-normal">
                  <DateField ariaLabel="Fecha del próximo pago" placeholder="Se calcula con el último pago, o elegí una" value={form.proximoPago} onChange={(value) => update('proximoPago', value)} />
                </div>
              </div>
            )}
          </div>
        </fieldset>
      ))}
    </>
  )
}
