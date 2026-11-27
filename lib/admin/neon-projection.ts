// Proyección del gasto del mes con el ritmo de la última semana (no con el promedio del mes entero,
// que se queda corto cuando el gasto subió hacia el final).
const WINDOW = 7

export function projectMonth(daily: { date: string; cost: number }[], today: string, daysInMonth: number, total: number) {
  const complete = daily.filter((d) => d.date < today).sort((a, b) => a.date.localeCompare(b.date))
  const elapsed = Number(today.slice(8, 10)) - 1
  if (elapsed < 1) return total
  const recent = complete.slice(-WINDOW)
  // Días sin consumo no aparecen en la lista: cuentan como 0 dentro de la ventana.
  const span = Math.min(WINDOW, elapsed)
  const avg = recent.filter((d) => d.date >= shift(today, -span)).reduce((t, d) => t + d.cost, 0) / span
  const done = complete.reduce((t, d) => t + d.cost, 0)
  return done + avg * (daysInMonth - elapsed)
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Horas que estuvo despierta una base en un día: CU-horas consumidas sobre el mínimo de CU (cota superior).
export const awakeHours = (cuHours: number, minCu: number) => (minCu > 0 ? cuHours / minCu : 0)
export const AWAKE_ALERT_HOURS = 12
