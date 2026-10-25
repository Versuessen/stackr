import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// Progressive enhancement: content is visible by default. Only when IntersectionObserver works
// and the user hasn't asked for reduced motion do elements wait offscreen to rise in.
const canAnimate = typeof window !== 'undefined' && 'IntersectionObserver' in window &&
  !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
if (canAnimate) document.documentElement.classList.add('io');

/** once = rise in and stay; otherwise float in and out as the element enters and leaves. */
export function useReveal<T extends HTMLElement = HTMLElement>(once = true) {
  const [seen, setSeen] = useState(false);
  const io = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    io.current?.disconnect();
    if (!el || !canAnimate) return;
    io.current = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) { setSeen(true); if (once) io.current?.disconnect(); }
      else if (!once && en.boundingClientRect.top > 0) setSeen(false);
    }, { threshold: 0.12 });
    io.current.observe(el);
  }, [once]);
  useEffect(() => () => io.current?.disconnect(), []);
  return [ref, seen ? 'seen' : ''] as const;
}

/** A window that can be dragged by its title bar (mouse/pen) or moved with arrow keys. */
export function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const bar = {
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch' || (e.target as HTMLElement).closest('button')) return;
      if (window.matchMedia('(max-width: 900px)').matches) return;
      drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current; if (!d) return;
      setPos({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy });
    },
    onPointerUp: () => { drag.current = null; },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 48 : 16;
      const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (m[e.key]) { e.preventDefault(); setPos((p) => ({ x: p.x + m[e.key][0], y: p.y + m[e.key][1] })); }
      else if (e.key === 'Home') { e.preventDefault(); setPos({ x: 0, y: 0 }); }
    },
  };
  return { style: { transform: `translate(${pos.x}px, ${pos.y}px)` }, bar };
}
