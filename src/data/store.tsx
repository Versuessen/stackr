import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, CustomLine, DB, ItemUnit, Lang, OrderLine, SellerProfile } from '../domain/types';
import { LocalRepository, cartStore, langPref, session, themePref, type Repository } from './repository';
import { ActionError, apply, markNoticesRead, tick } from './actions';
import { nowFrom } from '../domain/rules';
import { loadItems, type IndexedItem } from '../domain/items';
import { translate, type TFn } from '../i18n';

// Swap this for a RemoteRepository when the site goes multi-user.
const repo: Repository = new LocalRepository();

type Mut = (db: DB, now: number) => void;
export type Theme = 'light' | 'dark';
export type CartEntry = (OrderLine & { custom?: false }) | (CustomLine & { custom: true });

export interface Toast { id: number; text: React.ReactNode; action?: { label: string; run: () => void } }

interface StoreValue {
  db: DB;
  now: number;
  me: Account | null;
  mySeller: SellerProfile | null;
  lang: Lang;
  t: TFn;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Runs an action. Returns an error message, or null on success. */
  run: (fn: Mut) => string | null;
  replace: (db: DB) => void;
  setSession: (accountId: string | null) => void;
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
  const [db, setDb] = useState<DB>(() => apply(repo.load(), tick));
  const [sessionId, setSessionId] = useState<string | null>(() => session.get());
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

  const me = db.accounts.find((a) => a.id === sessionId) ?? null;
  const mySeller = me?.sellerId ? db.sellers.find((s) => s.id === me.sellerId) ?? null : null;

  const value: StoreValue = {
    db, now: nowFrom(db), me, mySeller, lang, t,
    setLang: (l) => { setLangState(l); langPref.set(l); },
    theme, setTheme: (x) => { setThemeState(x); themePref.set(x); },
    run,
    replace: (next) => commit(apply(next, tick)),
    setSession: (id) => { setSessionId(id); session.set(id); },
    readNotices: () => { if (me) run(markNoticesRead(me.id)); },
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
