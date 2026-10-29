import React, { createContext, useContext, useEffect, useState } from 'react';

// Routes are plain tokens ("orders", "order-ord-abc12") so they also survive inside previews
// that only pass simple #anchors. Prefix tells the page, rest is the id.
export type Route =
  | { page: 'home' } | { page: 'items' } | { page: 'farm'; id: string } | { page: 'orders' }
  | { page: 'order'; id: string } | { page: 'signin' } | { page: 'notices' } | { page: 'terms' }
  | { page: 'backstage' } | { page: 'clients' } | { page: 'settings' } | { page: 'beta' }
  | { page: 'privacy' } | { page: 'account' };

const SIMPLE = ['home', 'items', 'orders', 'signin', 'notices', 'terms', 'backstage', 'clients', 'settings', 'beta', 'privacy', 'account'] as const;
const WITH_ID = ['farm', 'order'] as const;

export function parse(token: string): Route {
  const raw = token.replace(/^#/, '');
  if (raw === 'cart') return { page: 'items' };
  if (raw === 'farms') return { page: 'farm', id: 'iron' };
  if ((SIMPLE as readonly string[]).includes(raw)) return { page: raw } as Route;
  for (const p of WITH_ID) if (raw.startsWith(`${p}-`)) return { page: p, id: raw.slice(p.length + 1) };
  return { page: 'home' };
}
export function toToken(r: Route): string {
  return 'id' in r ? `${r.page}-${r.id}` : r.page;
}

interface RouterValue { route: Route; go: (r: Route, anchor?: string) => void; }
const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route, anchor?: string) => {
    const token = toToken(r);
    setRoute(r);
    try { if (window.location.hash !== `#${token}`) window.history.pushState(null, '', `#${token}`); } catch { /* in-memory only */ }
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }), 60);
    else window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.hash));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return <Ctx.Provider value={{ route, go }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouter outside RouterProvider');
  return v;
}

export function Link({ to, anchor, children, className, onClick, ...rest }: {
  to: Route; anchor?: string; children: React.ReactNode; className?: string; onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick' | 'href'>) {
  const { go } = useRouter();
  return (
    <a {...rest} href={`#${toToken(to)}`} className={className} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); onClick?.(); go(to, anchor);
    }}>
      {children}
    </a>
  );
}
