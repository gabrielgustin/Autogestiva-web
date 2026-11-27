// Rentabilidad: lo que paga cada cliente por mes contra lo que cuesta su base en Neon (en USD, pasado a pesos).
export const planAmount = (plan: string) => Number.parseInt(plan.replace(/[^0-9]/g, ''), 10) || 0

type Member = { plan: string; neonProyecto: string }
export type ProfitRow = { key: string; nombre: string; ingreso: number; costoUsd: number; costoArs: number; ganancia: number; bases: string[] }

// Cada base se cuenta una sola vez por cliente aunque la usen varios de sus servicios.
export function profitByClient(groups: { key: string; nombre: string; members: Member[] }[], costUsd: Record<string, number>, dolar: number): ProfitRow[] {
  return groups
    .map(({ key, nombre, members }) => {
      const bases = [...new Set(members.map((m) => m.neonProyecto).filter(Boolean))]
      const ingreso = members.reduce((total, m) => total + planAmount(m.plan), 0)
      const usd = bases.reduce((total, id) => total + (costUsd[id] ?? 0), 0)
      const costoArs = Math.round(usd * dolar)
      return { key, nombre, ingreso, costoUsd: Math.round(usd * 100) / 100, costoArs, ganancia: ingreso - costoArs, bases }
    })
    .sort((a, b) => a.ganancia - b.ganancia)
}
