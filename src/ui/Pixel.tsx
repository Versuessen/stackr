import { farmDef } from '../domain/farms';
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
    const s = 51 + [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 97 + i;
    const kind = farmDef(id)?.scene ?? 'day';
    if (kind === 'nether') return get(`f${id}${i}`, () => netherScene(160, 90, s, id === 'gold' && i < 2 ? 'gold' : undefined));
    if (kind === 'end') return get(`f${id}${i}`, () => endScene(160, 90, s, i === 0));
    return get(`f${id}${i}`, () => dayScene(160, 90, s, i < 2 ? buildFor(id) : null));
  },
  card: (id: string): Scene => {
    const s = 31 + [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 53;
    const kind = farmDef(id)?.scene ?? 'day';
    if (kind === 'nether') return get(`c${id}`, () => netherScene(96, 72, s, id === 'gold' ? 'gold' : undefined));
    if (kind === 'end') return get(`c${id}`, () => endScene(96, 72, s, false));
    return get(`c${id}`, () => dayScene(96, 72, s, buildFor(id)));
  },
};
const OWN_BUILD = new Set(['iron', 'wool', 'tree', 'stone', 'raid', 'cane', 'bamboo', 'kelp', 'crops', 'flower', 'bonemeal', 'pumpkin']);
const buildFor = (id: string) => (OWN_BUILD.has(id) ? id : 'generic');
/** Icon per farm. */
export const FARM_ICON: Record<string, string> = {
  iron: 'iron', gold: 'gold', raid: 'raid', wool: 'wool', tree: 'tree', stone: 'stone', shulker: 'box', rocket: 'rocket',
  cane: 'cane', bamboo: 'bamboo', bonemeal: 'bone', flower: 'flower', crops: 'wheat', pumpkin: 'pumpkin', kelp: 'kelp',
  hoglin: 'food', blaze: 'rod', wither: 'skull', enderman: 'pearl', guardian: 'diamond', slime: 'slime', trading: 'emerald',
};
export const isNetherFarm = (id: string) => farmDef(id)?.scene === 'nether';
