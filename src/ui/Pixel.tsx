import React from 'react';
import { ART, FACE, G, dayScene, endScene, iconFor as iconForRaw, netherScene, type Art, type Scene } from './pixel';
import { useStore } from '../data/store';

export type GlyphName = keyof typeof G;
export const ICONS = ART as Record<string, Art>;
export const PORTRAIT = FACE as Art;
export const iconFor = (it: { id: string; cat: string }): Art => iconForRaw(it) as Art;

export function PixelArt({ art, size, vb = '0 0 12 12', className, style }: { art: Art; size?: number; vb?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox={vb} width={size} height={size} aria-hidden="true" shapeRendering="crispEdges" className={className} style={style}>
      {art.map((r, i) => <path key={i} d={r.d} style={{ fill: r.fill }} />)}
    </svg>
  );
}

export function Glyph({ name, size = 16, color = 'currentColor' }: { name: GlyphName; size?: number; color?: string }) {
  const g = (G as Record<string, { vb: string; d: string }>)[name];
  return (
    <svg viewBox={g.vb} width={size} height={size} aria-hidden="true" shapeRendering="crispEdges" className="glyph">
      <path d={g.d} style={{ fill: color }} />
    </svg>
  );
}

/** A generated landscape. Day scenes switch to their night palette in dark mode. */
export function SceneArt({ scene, label }: { scene: Scene; label?: string }) {
  const { theme } = useStore();
  const art = theme === 'dark' && scene.night ? scene.night : scene.art;
  return (
    <svg className="scene" viewBox={scene.vb} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {art.map((r, i) => <path key={i} d={r.d} style={{ fill: r.fill }} />)}
    </svg>
  );
}

export function sceneBg(scene: Scene, theme: string, day = '#5fb8ee') {
  return theme === 'dark' && scene.night ? '#0c1128' : day;
}

// Scenes are generated once per page load and reused.
const memo = new Map<string, Scene>();
function get(key: string, make: () => Scene) { if (!memo.has(key)) memo.set(key, make()); return memo.get(key)!; }

export type World = 'day' | 'nether' | 'end';
export const scenes = {
  hero: () => [get('h0', () => dayScene(240, 100, 7, 'iron')), get('h1', () => netherScene(240, 100, 3, 'gold')), get('h2', () => endScene(240, 100, 11, true))] as Scene[],
  worldFarm: () => get('w0', () => dayScene(150, 112, 21, 'tree')) as Scene,
  worldNether: () => get('w1', () => netherScene(130, 60, 5, undefined)) as Scene,
  worldEnd: () => get('w2', () => endScene(130, 60, 9, true)) as Scene,
  farm: (id: string, i: number): Scene => {
    const seeds: Record<string, number> = { iron: 51, gold: 61, raid: 71, wool: 81, tree: 91, stone: 101 };
    const s = (seeds[id] ?? 111) + i;
    if (id === 'gold') return get(`f${id}${i}`, () => netherScene(160, 90, s, i < 2 ? 'gold' : undefined));
    return get(`f${id}${i}`, () => dayScene(160, 90, s, i < 2 ? id : null));
  },
  card: (id: string): Scene => {
    const seeds: Record<string, number> = { iron: 31, gold: 33, raid: 35, wool: 37, tree: 39, stone: 41 };
    if (id === 'gold') return get(`c${id}`, () => netherScene(96, 72, 33, 'gold'));
    return get(`c${id}`, () => dayScene(96, 72, seeds[id] ?? 43, id));
  },
};
export const isNetherFarm = (id: string) => id === 'gold';
