// The shop data is one JSON document with a version number. Every write is
// "read, apply the pure action, save if the version is unchanged", retried on conflict, so two
// requests can never overwrite each other. At SMP scale this is fast and keeps every business
// rule in src/data/actions.ts, shared with the browser.

import type { DB } from '../src/domain/types.js';
import { apply, tick } from '../src/data/actions.js';
import { emptyDB, SCHEMA_VERSION, syncCatalog } from '../src/domain/catalog.js';
import type { Sql } from './db.js';

type Mut = (db: DB, now: number) => void;

export interface State { db: DB; version: number }

export class Conflict extends Error {}

export async function load(sql: Sql): Promise<State> {
  let rows = await sql.query<{ doc: DB; version: string | number }>('select doc, version from app_state where id = 1');
  if (!rows.length) {
    const fresh = emptyDB(Date.now());
    fresh.accounts[0].mcUuid = ''; // set to the real seller UUID on the seller's first sign-in
    await sql.query('insert into app_state (id, doc, version) values (1, $1::jsonb, 1) on conflict (id) do nothing', [JSON.stringify(fresh)]);
    rows = await sql.query('select doc, version from app_state where id = 1');
  }
  const doc = typeof rows[0].doc === 'string' ? JSON.parse(rows[0].doc as unknown as string) as DB : rows[0].doc;
  if (doc.version !== SCHEMA_VERSION) throw new Error(`schema ${doc.version} != ${SCHEMA_VERSION}`);
  doc.clockOffsetDays = 0; // beta-only tool, never active on the server
  syncCatalog(doc); // new farms and wording reach the stored shop without a migration
  return { db: doc, version: Number(rows[0].version) };
}

async function save(sql: Sql, db: DB, version: number): Promise<number> {
  const rows = await sql.query<{ version: string }>(
    'update app_state set doc = $1::jsonb, version = version + 1, updated_at = now() where id = 1 and version = $2 returning version',
    [JSON.stringify(db), version],
  );
  if (!rows.length) throw new Conflict();
  return Number(rows[0].version);
}

/** Applies `fn` (after the time-based housekeeping) and saves. Throws ActionError from the rules. */
export async function mutate(sql: Sql, fn: Mut): Promise<State> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await load(sql);
    const next = apply(apply(cur.db, tick), fn);
    try {
      return { db: next, version: await save(sql, next, cur.version) };
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
    }
  }
  throw new Error('state busy');
}

/** Reads the state; saves only if housekeeping (auto-complete, level changes) changed something. */
export async function read(sql: Sql): Promise<State> {
  const cur = await load(sql);
  const ticked = apply(cur.db, tick);
  if (JSON.stringify(ticked) === JSON.stringify(cur.db)) return cur;
  try { return { db: ticked, version: await save(sql, ticked, cur.version) }; } catch (e) {
    if (e instanceof Conflict) return load(sql);
    throw e;
  }
}
