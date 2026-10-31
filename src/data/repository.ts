// Browser storage. In beta the whole shop lives here (localStorage). In live mode the shop
// lives on the server (src/data/api.ts) and only harmless preferences stay here: language,
// theme and the cart (item ids and amounts). The session is an HttpOnly cookie, never stored here.

import type { DB } from '../domain/types';
import { SCHEMA_VERSION, exampleDB, syncCatalog } from '../domain/catalog';

export interface Repository {
  load(): DB;
  save(db: DB): void;
}

const KEY = 'stackr:db:v1';
const SESSION_KEY = 'stackr:session';
const LANG_KEY = 'stackr:lang';

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* storage blocked: keep working in memory */ }
}

export class LocalRepository implements Repository {
  load(): DB {
    const raw = safeGet(KEY);
    if (raw) {
      try {
        const db = JSON.parse(raw) as DB;
        if (db.version === SCHEMA_VERSION) return syncCatalog(db);
      } catch { /* fall through to a fresh copy */ }
    }
    return exampleDB(Date.now());
  }
  save(db: DB) {
    safeSet(KEY, JSON.stringify(db));
  }
}

/** Live mode: remove the beta copy of the shop and the beta session so they cannot be confused with real data. */
export function clearBetaData() {
  safeSet(KEY, null);
  safeSet(SESSION_KEY, null);
}

export const session = {
  get: () => safeGet(SESSION_KEY),
  set: (accountId: string | null) => safeSet(SESSION_KEY, accountId),
};

const CART_KEY = 'stackr:cart:v1';
const THEME_KEY = 'stackr:theme';

export const cartStore = {
  get: <T,>(fallback: T): T => { const raw = safeGet(CART_KEY); if (!raw) return fallback; try { return JSON.parse(raw) as T; } catch { return fallback; } },
  set: (value: unknown) => safeSet(CART_KEY, JSON.stringify(value)),
};

export const themePref = {
  get: () => safeGet(THEME_KEY),
  set: (theme: string) => safeSet(THEME_KEY, theme),
};

export const langPref = {
  get: () => safeGet(LANG_KEY),
  set: (lang: string) => safeSet(LANG_KEY, lang),
};
