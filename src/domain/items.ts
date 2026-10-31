// Item list for Minecraft Java 26.3 (public/items-26.3.json, built by scripts/build-items.mjs)
// plus the search and the unit maths the shop runs on. Pure functions, no React.

import type { ItemUnit, OrderLine } from './types.js';
import { dimensionsOf, groupsOf, type Dimension, type ItemGroup } from './groups.js';

export type ItemCat = 'blocks' | 'materials' | 'tools' | 'armor' | 'food' | 'redstone' | 'brewing';
export interface Item { id: string; en: string; de: string; stack: number; cat: ItemCat; rare?: string }
export interface ItemFile { version: string; count: number; items: Item[] }

export interface IndexedItem extends Item { fde: string; fen: string; hay: string; words: string[]; pop: number; groups: ItemGroup[]; dims: Dimension[] }

// Most ordered first. Drives the empty state ("Beliebt zuerst") and breaks ties in search.
export const POPULAR = ['netherite_ingot', 'elytra', 'shulker_box', 'ender_pearl', 'diamond', 'diamond_block', 'totem_of_undying', 'iron_ingot', 'oak_log', 'emerald', 'gold_ingot', 'redstone', 'obsidian', 'experience_bottle', 'golden_apple', 'iron_block', 'netherite_scrap', 'ancient_debris', 'blaze_rod', 'ender_eye', 'slime_ball', 'gunpowder', 'string', 'quartz', 'lapis_lazuli', 'copper_ingot', 'cobblestone', 'glass', 'torch', 'bread', 'cooked_beef', 'firework_rocket', 'beacon', 'spruce_log', 'stone_bricks', 'deepslate_bricks', 'white_wool', 'bone_meal', 'honey_block', 'sea_lantern', 'netherite_pickaxe', 'diamond_pickaxe', 'enchanted_book', 'netherite_block', 'purple_shulker_box'];
const POPRANK: Record<string, number> = {};
POPULAR.forEach((id, i) => { POPRANK[id] = POPULAR.length - i; });

export const CATS: ItemCat[] = ['blocks', 'materials', 'tools', 'armor', 'food', 'redstone', 'brewing'];

export const SETS: Record<'nether' | 'end', string[]> = {
  nether: ['netherite_ingot', 'netherite_scrap', 'ancient_debris', 'netherite_block', 'quartz', 'blaze_rod', 'glowstone_dust', 'glowstone', 'magma_cream', 'nether_wart', 'ghast_tear', 'wither_skeleton_skull', 'crying_obsidian', 'soul_sand', 'gold_ingot'],
  end: ['elytra', 'shulker_box', 'shulker_shell', 'ender_pearl', 'ender_eye', 'end_crystal', 'end_stone', 'purpur_block', 'end_rod', 'chorus_fruit', 'dragon_breath', 'dragon_head'],
};

export function fold(s: string) {
  return s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
}
const ENDINGS = ['innen', 'en', 'er', 'es', 'n', 'e', 's'];
function stem(w: string) {
  for (const e of ENDINGS) if (w.length - e.length >= 4 && w.endsWith(e)) return w.slice(0, -e.length);
  return w;
}
export function lev(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let k = 1; k <= b.length; k++) {
      const v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function indexItems(items: Item[]): IndexedItem[] {
  return items.map((it) => {
    const de = fold(it.de), en = fold(it.en), id = fold(it.id);
    return { ...it, fde: de, fen: en, hay: `${de} | ${en} | ${id}`, words: `${de} ${en} ${id}`.split(' ').filter(Boolean), pop: POPRANK[it.id] ?? 0, groups: groupsOf(it.id), dims: dimensionsOf(it.id) };
  });
}

function tokMatch(it: IndexedItem, t: string, lang: 'de' | 'en') {
  const s = stem(t);
  const name = lang === 'de' ? it.fde : it.fen;
  const hit = s.length >= 3 ? it.hay.includes(s) : ` ${it.hay}`.includes(` ${s}`);
  if (hit) return name.includes(s) ? 0 : 2;
  if (t.length >= 5) for (const w of it.words) {
    if (lev(t, w.slice(0, t.length), 1) <= 1 || lev(t, w.slice(0, t.length + 1), 1) <= 1 || lev(t, w, 1) <= 1) return 3;
  }
  return -1;
}

/** Lenient in, strict out: umlauts, endings, several words and one typo per word are fine. */
export function searchItems(items: IndexedItem[], q: string, cat: ItemCat | 'all', lang: 'de' | 'en' = 'de'): IndexedItem[] {
  const fq = fold(q), toks = fq.split(' ').filter(Boolean);
  const pool = cat === 'all' ? items : items.filter((it) => it.cat === cat);
  const nameOf = (it: IndexedItem) => (lang === 'de' ? it.de : it.en);
  if (!toks.length) return [...pool].sort((a, b) => b.pop - a.pop || nameOf(a).localeCompare(nameOf(b), lang));
  const out: [number, IndexedItem][] = [];
  for (const it of pool) {
    let worst = 0, ok = true;
    for (const t of toks) { const m = tokMatch(it, t, lang); if (m < 0) { ok = false; break; } worst = Math.max(worst, m); }
    if (!ok) continue;
    const name = lang === 'de' ? it.fde : it.fen;
    out.push([name === fq ? 0 : name.startsWith(fq) ? 1 : worst === 0 ? 2 : worst === 2 ? 3 : 4, it]);
  }
  out.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || nameOf(a[1]).length - nameOf(b[1]).length || nameOf(a[1]).localeCompare(nameOf(b[1]), lang));
  return out.map((p) => p[1]);
}

/** "Meintest du …?" for a query with no results. */
export function suggestItem(items: IndexedItem[], q: string, lang: 'de' | 'en' = 'de'): IndexedItem | null {
  const fq = fold(q); if (fq.length < 3) return null;
  const lim = Math.min(2, Math.floor(fq.length / 3));
  let best: IndexedItem | null = null, bd = lim + 1;
  for (const it of items) {
    const n = lang === 'de' ? it.fde : it.fen;
    const d = Math.min(lev(fq, n, 3), lev(fq, n.slice(0, fq.length), 3), lev(fq, n.slice(0, fq.length + 1), 3));
    if (d < bd || (d === bd && best && it.pop > best.pop)) { bd = d; best = it; }
  }
  return bd <= lim ? best : null;
}

// ---------- Units: game numbers, worked out per item ----------

export function unitOk(it: { id?: string; itemId?: string; stack: number }, unit: ItemUnit) {
  const id = it.id ?? it.itemId ?? '';
  if (unit === 'piece') return true;
  if (unit === 'stack') return it.stack > 1;
  return it.stack > 1 && !/shulker_box$/.test(id);
}
export function multOf(it: { stack: number }, unit: ItemUnit) {
  return unit === 'stack' ? it.stack : unit === 'shulker' ? 27 * it.stack : 1;
}
export const defaultUnit = (it: { stack: number }): ItemUnit => (it.stack > 1 ? 'stack' : 'piece');
export const piecesOf = (l: Pick<OrderLine, 'stack' | 'n' | 'unit'>) => l.n * multOf(l, l.unit);
export const slotsOf = (l: Pick<OrderLine, 'stack' | 'n' | 'unit'>) => Math.ceil(piecesOf(l) / l.stack);

export function cartTotals(lines: Pick<OrderLine, 'stack' | 'n' | 'unit'>[]) {
  let pieces = 0, slots = 0;
  for (const l of lines) { pieces += piecesOf(l); slots += slotsOf(l); }
  return { pieces, slots, shulkers: Math.ceil(slots / 27) };
}

let cache: Promise<{ version: string; items: IndexedItem[] }> | null = null;
export function loadItems() {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}items-26.3.json`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<ItemFile>; })
      .then((f) => ({ version: f.version, items: indexItems(f.items) }));
    cache.catch(() => { cache = null; });
  }
  return cache;
}
