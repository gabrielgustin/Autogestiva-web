'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Handlers = { onStart: () => void; onMove: (scope: string, key: string, target: string, after: boolean) => void; onDrop: () => void; onCancel: () => void }
type Drag = { scope: string; key: string; node: HTMLElement; x0: number; y0: number; y: number; dy: number; hitX: number; active: boolean; touch: boolean; timer?: number; ghost?: HTMLElement }

// Ordenar filas arrastrando (mouse, lápiz o dedo), como las tarjetas del embudo pero en vertical: una copia de la fila
// sigue al puntero, las demás le hacen lugar y cerca de los bordes la página se desplaza sola.
// Cada fila lleva data-sort-scope y data-sort-key; solo se intercambian filas del mismo scope.
export function useDragSort(handlers: Handlers) {
  const [dragging, setDragging] = useState<{ scope: string; key: string } | null>(null)
  const drag = useRef<Drag | null>(null)
  // Mientras es true, el click que sigue a soltar no debe abrir la fila.
  const moved = useRef(false)
  const on = useRef(handlers)
  on.current = handlers

  const place = (d: Drag) => { if (d.ghost) d.ghost.style.transform = `translate3d(0, ${d.y - d.dy}px, 0)` }

  const activate = useCallback(() => {
    const d = drag.current
    if (!d || d.active) return
    d.active = true
    moved.current = true
    const rect = d.node.getBoundingClientRect()
    const ghost = d.node.cloneNode(true) as HTMLElement
    delete ghost.dataset.sortScope
    ghost.setAttribute('aria-hidden', 'true')
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: '0', width: `${rect.width}px`, margin: '0', zIndex: '100', pointerEvents: 'none', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 0 0 1px rgba(11,19,34,0.15), 0 28px 60px -20px rgba(11,19,34,0.55)' })
    document.body.appendChild(ghost)
    document.body.style.cursor = 'grabbing'
    d.ghost = ghost
    place(d)
    on.current.onStart()
    setDragging({ scope: d.scope, key: d.key })
    navigator.vibrate?.(12)
  }, [])

  const start = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    const handle = !!target.closest('[data-drag-handle]')
    const node = e.currentTarget.closest<HTMLElement>('[data-sort-scope]')
    moved.current = false
    if (e.button !== 0 || !node || (!handle && target.closest('a, button, input, [data-no-drag]'))) return
    const rect = node.getBoundingClientRect()
    // Con el dedo hay que mantener apretado un instante (salvo desde la manija): así deslizar sigue desplazando.
    const d: Drag = { scope: node.dataset.sortScope!, key: node.dataset.sortKey!, node, x0: e.clientX, y0: e.clientY, y: e.clientY, dy: e.clientY - rect.top, hitX: rect.left + rect.width / 2, active: false, touch: e.pointerType === 'touch' && !handle }
    drag.current = d
    if (d.touch) d.timer = window.setTimeout(activate, 280)
  }, [activate])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const d = drag.current
      if (!d?.active) return
      // Velocidad que crece cuanto más cerca del borde está el puntero.
      const speed = (depth: number) => Math.round(Math.min(1, depth / 90) ** 2 * 26) + 2
      const top = (document.querySelector('header.sticky')?.getBoundingClientRect().bottom ?? 0) + 90
      const bottom = window.innerHeight - 90
      if (d.y < top) window.scrollBy({ top: -speed(top - d.y), behavior: 'instant' })
      else if (d.y > bottom) window.scrollBy({ top: speed(d.y - bottom), behavior: 'instant' })
      let node = document.elementFromPoint(d.hitX, d.y) as HTMLElement | null
      while (node && node.dataset.sortScope !== d.scope) node = node.parentElement
      if (node && node.dataset.sortKey !== d.key) {
        const r = node.getBoundingClientRect()
        on.current.onMove(d.scope, d.key, node.dataset.sortKey!, d.y > r.top + r.height / 2)
      }
      raf = requestAnimationFrame(tick)
    }
    const finish = (dropped: boolean) => {
      const d = drag.current
      drag.current = null
      cancelAnimationFrame(raf)
      raf = 0
      if (!d) return
      window.clearTimeout(d.timer)
      if (!d.active) return
      d.ghost?.remove()
      document.body.style.cursor = ''
      setDragging(null)
      if (dropped) on.current.onDrop()
      else on.current.onCancel()
      window.setTimeout(() => { moved.current = false }, 0)
    }
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      // Si se soltó el botón fuera de la ventana, al volver se termina el arrastre.
      if (d.active && !d.touch && e.buttons === 0) return finish(true)
      d.y = e.clientY
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x0, d.y - d.y0) < 6) return
        // Con el dedo, moverse antes de tiempo es desplazarse, no arrastrar.
        if (d.touch) { window.clearTimeout(d.timer); drag.current = null; return }
        activate()
      }
      if (!raf) raf = requestAnimationFrame(tick)
      place(d)
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    const onTouchMove = (e: TouchEvent) => { if (drag.current?.active) e.preventDefault() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current?.active) finish(false) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      finish(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [activate])

  return { dragging, start, moved }
}
