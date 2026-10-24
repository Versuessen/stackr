import React, { createContext, useContext, useEffect, useState } from 'react';

// Routes are plain tokens ("orders", "order-ord-abc12") so they also survive inside the
// claude.ai preview, which only passes simple #anchors. Prefix tells the page, rest is the id.
export type Route =
  | { page: 'home' } | { page: 'seller'; id: string } | { page: 'new'; id: string } | { page: 'orders' }
  | { page: 'order'; id: string } | { page: 'signin' } | { page: 'notices' } | { page: 'terms' }
  | { page: 'backstage' } | { page: 'clients' } | { page: 'settings' } | { page: 'beta' };

const SIMPLE = ['home', 'orders', 'signin', 'notices', 'terms', 'backstage', 'clients', 'settings', 'beta'] as const;
const WITH_ID = ['seller', 'new', 'order'] as const;

export function parse(token: string): Route {
  const raw = token.replace(/^#/, '');
  if ((SIMPLE as readonly string[]).includes(raw)) return { page: raw } as Route;
  for (const p of WITH_ID) if (raw.startsWith(`${p}-`)) return { page: p, id: raw.slice(p.length + 1) };
  return { page: 'home' };
}
export function toToken(r: Route): string {
  return 'id' in r ? `${r.page}-${r.id}` : r.page;
}

interface RouterValue { route: Route; go: (r: Route) => void; }
const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    const token = toToken(r);
    setRoute(r);
    try { if (window.location.hash !== `#${token}`) window.location.hash = token; } catch { /* in-memory only */ }
    window.scrollTo({ top: 0 });
  };
  return <Ctx.Provider value={{ route, go }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouter outside RouterProvider');
  return v;
}

export function Link({ to, children, className }: { to: Route; children: React.ReactNode; className?: string }) {
  const { go } = useRouter();
  return (
    <a href={`#${toToken(to)}`} className={className} onClick={(e) => { e.preventDefault(); go(to); }}>
      {children}
    </a>
  );
}
