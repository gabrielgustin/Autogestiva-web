// Devuelve la lista con `key` puesto antes o después de `target`; la misma lista (sin copiar) si ya estaba ahí.
export function reorder<T>(list: T[], keyOf: (item: T) => string, key: string, target: string, after: boolean): T[] {
  const item = list.find((x) => keyOf(x) === key)
  if (!item || key === target) return list
  const rest = list.filter((x) => x !== item)
  const at = rest.findIndex((x) => keyOf(x) === target)
  if (at < 0) return list
  rest.splice(at + (after ? 1 : 0), 0, item)
  return rest.every((x, i) => x === list[i]) ? list : rest
}
