export const COLUMNS = ['nombre', 'apellido', 'empresa', 'producto', 'dominio', 'dominioVencimiento', 'mail', 'telefono', 'servidor', 'baseDatos', 'plan', 'metodoPago', 'ultimoPago', 'proximoPago', 'avisoSuscripcion', 'valorVenta'] as const

export type ClientColumn = (typeof COLUMNS)[number]
export type ClientInput = Record<ClientColumn, string>
// `row` es el id (uuid) del cliente en la base.
export type SheetClient = ClientInput & { row: string }
export type ClientTask = { id: string; clientId: string; texto: string; fecha: string }

export const COLUMN_LABELS: Record<ClientColumn, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  empresa: 'Empresa',
  producto: 'Producto',
  dominio: 'Dominio',
  dominioVencimiento: 'Vencimiento del dominio',
  mail: 'Mail',
  telefono: 'Teléfono',
  servidor: 'Servidor',
  baseDatos: 'Base de Datos',
  plan: 'Plan',
  metodoPago: 'Método de pago',
  ultimoPago: 'Último pago',
  proximoPago: 'Próximo pago',
  avisoSuscripcion: 'Aviso para enviar el link de suscripción',
  valorVenta: 'Valor de venta',
}

export function fingerprint(values: ClientInput) {
  return COLUMNS.map((column) => values[column] ?? '').join('\u0001')
}
