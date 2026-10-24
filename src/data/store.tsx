import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, DB, Lang, SellerProfile } from '../domain/types';
import { LocalRepository, langPref, session, type Repository } from './repository';
import { ActionError, apply, markNoticesRead, tick } from './actions';
import { nowFrom } from '../domain/rules';
import { translate, type TFn } from '../i18n';

// Swap this for a RemoteRepository when the site goes multi-user.
const repo: Repository = new LocalRepository();

type Mut = (db: DB, now: number) => void;

interface StoreValue {
  db: DB;
  now: number;
  me: Account | null;
  mySeller: SellerProfile | null;
  lang: Lang;
  t: TFn;
  setLang: (l: Lang) => void;
  /** Runs an action. Returns an error message, or null on success. */
  run: (fn: Mut) => string | null;
  replace: (db: DB) => void;
  setSession: (accountId: string | null) => void;
  readNotices: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<StoreValue | null>(null);

function initialLang(): Lang {
  const saved = langPref.get();
  if (saved === 'de' || saved === 'en') return saved;
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'de';
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => apply(repo.load(), tick));
  const [sessionId, setSessionId] = useState<string | null>(() => session.get());
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [toast, setToast] = useState<string | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  const t = useMemo<TFn>(() => (key, vars) => translate(lang, key, vars), [lang]);

  const commit = useCallback((next: DB) => {
    dbRef.current = next;
    setDb(next);
    repo.save(next);
  }, []);

  const run = useCallback((fn: Mut): string | null => {
    try {
      commit(apply(dbRef.current, fn));
      return null;
    } catch (e) {
      if (e instanceof ActionError) return translate(lang, e.key, e.vars);
      console.error(e);
      return translate(lang, 'err.unknown');
    }
  }, [commit, lang]);

  // Approval windows and level grace periods depend on time passing.
  useEffect(() => {
    const id = window.setInterval(() => commit(apply(dbRef.current, tick)), 60_000);
    return () => window.clearInterval(id);
  }, [commit]);

  const timer = useRef<number>();
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const me = db.accounts.find((a) => a.id === sessionId) ?? null;
  const mySeller = me?.sellerId ? db.sellers.find((s) => s.id === me.sellerId) ?? null : null;

  const value: StoreValue = {
    db, now: nowFrom(db), me, mySeller, lang, t,
    setLang: (l) => { setLangState(l); langPref.set(l); document.documentElement.lang = l; },
    run,
    replace: (next) => commit(apply(next, tick)),
    setSession: (id) => { setSessionId(id); session.set(id); },
    readNotices: () => { if (me) run(markNoticesRead(me.id)); },
    toast, showToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
