// Postgres access. Production uses Neon's HTTP driver (no connection pool to exhaust on
// serverless); tests plug in an in-process Postgres with the same interface.
// Every query is parameterised ($1, $2 …); no value is ever concatenated into SQL.

import { neon } from '@neondatabase/serverless';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonSql(url: string): Sql {
  const run = neon(url);
  return { query: async (text, params = []) => (await run.query(text, params)) as never };
}

const MIGRATIONS = [
  `create table if not exists app_state (
     id smallint primary key check (id = 1),
     doc jsonb not null,
     version bigint not null,
     updated_at timestamptz not null default now())`,
  `create table if not exists sessions (
     id_hash text primary key,
     account_id text not null,
     mfa_ok boolean not null default false,
     created_at timestamptz not null default now(),
     last_seen_at timestamptz not null default now(),
     expires_at timestamptz not null)`,
  `create index if not exists sessions_account on sessions (account_id)`,
  `create table if not exists seller_mfa (
     account_id text primary key,
     secret_enc text not null,
     enrolled_at timestamptz,
     last_step bigint not null default 0,
     recovery_hashes text[] not null default '{}',
     updated_at timestamptz not null default now())`,
  `create table if not exists rate_limits (
     key text primary key,
     count integer not null,
     reset_at timestamptz not null)`,
  `create table if not exists audit_log (
     id bigserial primary key,
     at timestamptz not null default now(),
     account_id text,
     event text not null,
     ip_hash text)`,
  `create index if not exists audit_at on audit_log (at)`,
];

const ready = new WeakMap<Sql, Promise<void>>();
/** Creates the tables on first use (idempotent). */
export function migrate(sql: Sql): Promise<void> {
  let p = ready.get(sql);
  if (!p) {
    p = (async () => {
      // Skip DDL when everything exists, so a least-privilege role (no CREATE rights) works.
      const r = await sql.query<{ n: number }>(
        "select count(*)::int as n from unnest(array['app_state','sessions','seller_mfa','rate_limits','audit_log']) t where to_regclass('public.' || t) is not null");
      if (Number(r[0]?.n) === 5) return;
      for (const m of MIGRATIONS) await sql.query(m);
    })();
    p.catch(() => ready.delete(sql));
    ready.set(sql, p);
  }
  return p;
}

export async function audit(sql: Sql, event: string, accountId: string | null, ipHash: string | null) {
  await sql.query('insert into audit_log (account_id, event, ip_hash) values ($1, $2, $3)', [accountId, event.slice(0, 80), ipHash]);
}
