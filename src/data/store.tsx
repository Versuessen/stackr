import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, CustomLine, DB, ItemUnit, Lang, OrderLine, SellerProfile } from '../domain/types';
import { LocalRepository, cartStore, clearBetaData, langPref, session, themePref } from './repository';
import { ActionError, apply, signIn, tick } from './actions';
import { toMut, type Command } from './commands';
import { ApiError, apiGet, apiPost } from './api';
import { nowFrom } from '../domain/rules';
import { emptyDB } from '../domain/catalog';
import { loadItems, type IndexedItem } from '../domain/items';
import { translate, type TFn } from '../i18n';

// Two modes, decided once at start:
//  - live: the API answers /api/state. Data lives on the server; this tab only holds the part
//    the signed-in person may see, in memory. Nothing personal is written to localStorage.
//  - beta: no backend configured (or offline preview). Everything runs locally as before.
export type Mode = 'loading' | 'beta' | 'live';
export type Theme = 'light' | 'dark';
export type CartEntry = (OrderLine & { custom?: false }) | (CustomLine & { custom: true });
export type MfaState = 'needed' | 'enroll' | null;

export interface LiveInfo {
  mfa: MfaState;
  pending: { mcName: string } | null;
  auth: { ready: boolean };
}
interface StatePayload extends LiveInfo { mode: 'live' | 'beta'; version: number; me: string | null; db: DB }

export interface Toast { id: number; text: React.ReactNode; action?: { label: string; run: () => void } }

interface StoreValue {
  mode: Mode;
  live: LiveInfo | null;
  db: DB;
  now: number;
  me: Account | null;
  mySeller: SellerProfile | null;
  lang: Lang;
  t: TFn;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Runs a command. Resolves to an error message, or null on success. */
  run: (cmd: Command) => Promise<string | null>;
  /** Same as run, also returns the id of what was created (new orders). */
  runForId: (cmd: Command) => Promise<{ error: string | null; id?: string }>;
  /** Re-reads the server state (live). */
  refresh: () => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  /** Beta only. */
  replace: (db: DB) => void;
  setSession: (accountId: string | null) => void;
  betaSignIn: (mcName: string) => string | null;
  readNotices: () => void;
  toasts: Toast[];
  showToast: (text: React.ReactNode, action?: Toast['action']) => void;
  closeToast: (id: number) => void;
  items: IndexedItem[];
  itemsState: 'loading' | 'ready' | 'failed';
  itemsVersion: string;
  cart: CartEntry[];
  setCart: (c: CartEntry[]) => void;
  addToCart: (it: { id: string; de: string; en: string; stack: number }, n: number, unit: ItemUnit) => void;
  cartBump: number;
}

const Ctx = createContext<StoreValue | null>(null);
const localRepo = new LocalRepository();

function initialLang(): Lang {
  const saved = langPref.get();
  if (saved === 'de' || saved === 'en') return saved;
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'de';
}
function initialTheme(): Theme {
  const saved = themePref.get();
  if (saved === 'light' || saved === 'dark') return saved;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [db, setDb] = useState<DB>(() => emptyDB(Date.now()));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [items, setItems] = useState<IndexedItem[]>([]);
  const [itemsState, setItemsState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [itemsVersion, setItemsVersion] = useState('26.3');
  const [cart, setCartState] = useState<CartEntry[]>(() => cartStore.get<CartEntry[]>([]));
  const [cartBump, setCartBump] = useState(0);
  const dbRef = useRef(db);
  dbRef.current = db;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const etag = useRef<string | null>(null);
  const showToastRef = useRef<(text: React.ReactNode) => void>(() => {});
  const langRef = useRef(lang);
  langRef.current = lang;

  const t = useMemo<TFn>(() => (key, vars) => translate(lang, key, vars), [lang]);
  const msg = useCallback((e: unknown) => {
    if (e instanceof ActionError || e instanceof ApiError) return translate(lang, e.key, e.vars);
    if (e instanceof TypeError) return translate(lang, 'err.offline'); // fetch failed: network
    console.error(e);
    return translate(lang, 'err.unknown');
  }, [lang]);

  const applyPayload = useCallback((p: StatePayload) => {
    dbRef.current = p.db;
    setDb(p.db);
    setSessionId(p.me);
    setLive({ mfa: p.mfa, pending: p.pending, auth: p.auth });
  }, []);

  // Back from "Sign in with Microsoft": greet once, then clean the address bar.
  const welcomeBack = (p: StatePayload) => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has('signed_in')) return;
      u.searchParams.delete('signed_in');
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
      const name = p.db.accounts.find((a) => a.id === p.me)?.mcName ?? p.pending?.mcName;
      if (name && !p.mfa) window.setTimeout(() => showToastRef.current(translate(langRef.current, 'auth.welcome', { name })), 300);
    } catch { /* ignore */ }
  };

  const refresh = useCallback(async () => {
    if (modeRef.current !== 'live') return;
    try {
      const r = await apiGet<StatePayload>('state', etag.current);
      if (r.data) { etag.current = r.etag; applyPayload(r.data); }
    } catch { /* keep showing the last state; next poll retries */ }
  }, [applyPayload]);

  // Decide the mode once.
  useEffect(() => {
    let done = false;
    const toBeta = () => {
      if (done) return; done = true;
      const local = apply(localRepo.load(), tick);
      dbRef.current = local; setDb(local);
      setSessionId(session.get());
      setMode('beta');
    };
    const timer = window.setTimeout(toBeta, 5000);
    apiGet<StatePayload>('state').then((r) => {
      if (done) return;
      if (r.data?.mode === 'live') {
        done = true;
        window.clearTimeout(timer);
        etag.current = r.etag;
        clearBetaData();
        applyPayload(r.data);
        setMode('live');
        welcomeBack(r.data);
      } else { window.clearTimeout(timer); toBeta(); }
    }, () => { window.clearTimeout(timer); toBeta(); });
    return () => window.clearTimeout(timer);
  }, [applyPayload]);

  // Live: pick up changes from the other side (seller replies, status changes).
  useEffect(() => {
    if (mode !== 'live') return;
    const poll = () => { if (document.visibilityState === 'visible') void refresh(); };
    const id = window.setInterval(poll, 20_000);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    return () => { window.clearInterval(id); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [mode, refresh]);

  // Beta: approval windows and level grace periods depend on time passing.
  const commitLocal = useCallback((next: DB) => {
    dbRef.current = next;
    setDb(next);
    localRepo.save(next);
  }, []);
  useEffect(() => {
    if (mode !== 'beta') return;
    const id = window.setInterval(() => commitLocal(apply(dbRef.current, tick)), 60_000);
    return () => window.clearInterval(id);
  }, [mode, commitLocal]);

  const me = db.accounts.find((a) => a.id === sessionId) ?? null;
  const mySeller = me?.sellerId ? db.sellers.find((s) => s.id === me.sellerId) ?? null : null;
  const meRef = useRef(me);
  meRef.current = me;

  const runForId = useCallback(async (cmd: Command): Promise<{ error: string | null; id?: string }> => {
    if (modeRef.current === 'live') {
      try {
        const r = await apiPost<{ id?: string; db: DB; version: number }>('command', { cmd });
        dbRef.current = r.db;
        setDb(r.db);
        etag.current = null;
        return { error: null, id: r.id };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) void refresh();
        return { error: msg(e) };
      }
    }
    const actor = meRef.current;
    if (!actor) return { error: translate(lang, 'err.signInFirst') };
    let id: string | undefined;
    try {
      commitLocal(apply(dbRef.current, toMut(cmd, actor, (x) => { id = x; })));
      return { error: null, id };
    } catch (e) { return { error: msg(e) }; }
  }, [commitLocal, lang, msg, refresh]);
  const run = useCallback(async (cmd: Command) => (await runForId(cmd)).error, [runForId]);

  const signOut = useCallback(async (everywhere = false) => {
    if (modeRef.current === 'live') {
      try { await apiPost(everywhere ? 'auth/logout-all' : 'auth/logout'); } catch { /* cookie is cleared server-side anyway */ }
      etag.current = null;
      await refresh();
    } else { setSessionId(null); session.set(null); }
  }, [refresh]);

  const betaSignIn = useCallback((mcName: string) => {
    let id = '';
    try { commitLocal(apply(dbRef.current, signIn(mcName, (x) => { id = x; }))); } catch (e) { return msg(e); }
    setSessionId(id); session.set(id);
    return null;
  }, [commitLocal, msg]);

  useEffect(() => {
    loadItems().then((r) => { setItems(r.items); setItemsVersion(r.version); setItemsState('ready'); }, () => setItemsState('failed'));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#121018' : '#f4f4f7');
  }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const timers = useRef(new Map<number, number>());
  const closeToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const showToast = useCallback((text: React.ReactNode, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, text, action }]);
    timers.current.set(id, window.setTimeout(() => closeToast(id), 4000));
  }, [closeToast]);

  showToastRef.current = showToast;

  const setCart = useCallback((c: CartEntry[]) => { cartRef.current = c; setCartState(c); cartStore.set(c); }, []);
  const addToCart = useCallback<StoreValue['addToCart']>((it, n, unit) => {
    const prev = cartRef.current;
    const next = [...prev];
    const i = next.findIndex((c) => !c.custom && c.itemId === it.id && c.unit === unit);
    if (i >= 0) { const c = next[i] as OrderLine; next[i] = { ...c, n: Math.min(9999, c.n + n) }; }
    else next.push({ itemId: it.id, de: it.de, en: it.en, stack: it.stack, n, unit });
    setCart(next);
    setCartBump((b) => b + 1);
    const unitWord = translate(lang, `unit.${unit}${n === 1 ? '' : 's'}`);
    showToast(<><b>{n} {unitWord}</b> {lang === 'de' ? it.de : it.en} {translate(lang, 'cart.added')}</>,
      { label: translate(lang, 'common.undo'), run: () => setCart(prev) });
  }, [lang, setCart, showToast]);

  const value: StoreValue = {
    mode, live, db, now: nowFrom(db), me, mySeller, lang, t,
    setLang: (l) => { setLangState(l); langPref.set(l); },
    theme, setTheme: (x) => { setThemeState(x); themePref.set(x); },
    run, runForId, refresh, signOut,
    replace: (next) => { if (modeRef.current === 'beta') commitLocal(apply(next, tick)); },
    setSession: (id) => { if (modeRef.current === 'beta') { setSessionId(id); session.set(id); } },
    betaSignIn,
    readNotices: () => { if (me) void run({ type: 'markNoticesRead' }); },
    toasts, showToast, closeToast,
    items, itemsState, itemsVersion, cart, setCart, addToCart, cartBump,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
