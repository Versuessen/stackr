// Storage boundary. Beta keeps everything in this browser (localStorage).
// To go multi-user, write a RemoteRepository with the same two methods that talks to an API
// (e.g. Vercel functions + Postgres) and swap it in src/data/store.tsx. Nothing else changes.

import type { DB } from '../domain/types';
import { SCHEMA_VERSION, exampleDB } from '../domain/catalog';

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
        if (db.version === SCHEMA_VERSION) return db;
      } catch { /* fall through to a fresh copy */ }
    }
    return exampleDB(Date.now());
  }
  save(db: DB) {
    safeSet(KEY, JSON.stringify(db));
  }
}

export const session = {
  get: () => safeGet(SESSION_KEY),
  set: (accountId: string | null) => safeSet(SESSION_KEY, accountId),
};

export const langPref = {
  get: () => safeGet(LANG_KEY),
  set: (lang: string) => safeSet(LANG_KEY, lang),
};
