// The item list the order lines are checked against. Names and stack sizes come from this file,
// never from the browser, so a client cannot rename an item or fake a stack size.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OrderLine } from '../src/domain/types.js';
import { HttpError } from './http.js';

type Item = { id: string; de: string; en: string; stack: number };
let cache: Map<string, Item> | null = null;

export function itemMap(): Map<string, Item> {
  if (cache) return cache;
  const candidates = [join(process.cwd(), 'public', 'items-26.3.json'), new URL('../public/items-26.3.json', import.meta.url).pathname];
  for (const p of candidates) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf8')) as { items: Item[] };
      cache = new Map(data.items.map((i) => [i.id, { id: i.id, de: i.de, en: i.en, stack: i.stack }]));
      return cache;
    } catch { /* try the next location */ }
  }
  throw new Error('item list missing');
}

export function resolveLines(lines: { itemId: string; n: number; unit: OrderLine['unit'] }[]): OrderLine[] {
  const map = itemMap();
  return lines.map((l) => {
    const it = map.get(l.itemId);
    if (!it) throw new HttpError(422, 'err.itemUnknown');
    return { itemId: it.id, de: it.de, en: it.en, stack: it.stack, n: l.n, unit: l.unit };
  });
}
