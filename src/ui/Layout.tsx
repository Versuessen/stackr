import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from './router';
import { useSearch } from './search';
import { Glyph, PixelArt, iconFor } from './Pixel';
import { defaultUnit, searchItems, suggestItem } from '../domain/items';
import { publicWaitDays } from '../domain/rules';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="30" height="30" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="1" y="8" width="10" height="3" style={{ fill: light ? '#fff' : 'var(--ink)' }} />
      <rect x="2" y="4.5" width="8" height="3" style={{ fill: 'var(--lapis)' }} />
      <rect x="3" y="1" width="6" height="3" style={{ fill: 'var(--slime)' }} />
    </svg>
  );
}

export function useShopStatus() {
  const { db, t } = useStore();
  const s = db.sellers[0];
  if (!s) return { text: '', away: true };
  if (!s.accepting) return { text: t('status.closed'), away: true };
  if (s.vacation.on) return { text: t('status.vacation'), away: true };
  return { text: t('status.open', { n: publicWaitDays(db, s) }), away: false };
}

function HeaderSearch() {
  const { t, items, itemsState, addToCart, lang } = useStore();
  const { route, go } = useRouter();
  const { q, setQ, setSet } = useSearch();
  const live = route.page === 'items';
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const blur = useRef<number>();
  const res = !live && q.trim() && itemsState === 'ready' ? searchItems(items, q, 'all', lang) : [];
  const top = res.slice(0, 6);
  const sug = !res.length && q.trim().length >= 3 && itemsState === 'ready' ? suggestItem(items, q, lang) : null;
  const show = !live && open && q.trim().length > 0;
  const toShop = () => { setOpen(false); setSet(''); go({ page: 'items' }); };
  const pick = (i: number) => { const it = top[i]; if (!it) return; addToCart(it, 1, defaultUnit(it)); setOpen(false); setAct(-1); };

  return (
    <div className="srch" role="search">
      <form className="srch-box" onSubmit={(e) => { e.preventDefault(); if (act >= 0 && show) pick(act); else toShop(); }}>
        <Glyph name="search" size={18} color="var(--ink-2)" />
        <label className="sr" htmlFor="hq">{t('search.label')}</label>
        <input id="hq" type="text" autoComplete="off" spellCheck={false} value={q}
          placeholder={live ? t('search.placeholderLive') : t('search.placeholder')}
          role={live ? undefined : 'combobox'} aria-autocomplete={live ? undefined : 'list'} aria-controls={live ? undefined : 'hq-list'}
          aria-expanded={live ? undefined : show} aria-activedescendant={show && act >= 0 ? `hq-opt-${act}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(-1); if (live) setSet(''); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { window.clearTimeout(blur.current); blur.current = window.setTimeout(() => setOpen(false), 160); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { if (live) setQ(''); setOpen(false); setAct(-1); return; }
            if (live || !top.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((a) => (a + 1) % top.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => (a - 1 + top.length) % top.length); }
          }} />
        {q && <button className="icon-btn" type="button" aria-label={t('search.clear')} onClick={() => { setQ(''); setAct(-1); }}><Glyph name="x" size={12} /></button>}
        {!live && <button className="srch-go" type="submit">{t('search.go')}</button>}
      </form>
      {show && (
        <div className="sug">
          {top.length > 0 ? (
            <ul id="hq-list" role="listbox" aria-label={t('search.suggestions')} className="plain">
              {top.map((it, i) => (
                <li key={it.id} id={`hq-opt-${i}`} className="sug-opt" role="option" aria-selected={i === act}
                  onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setAct(i)}>
                  <span className="sug-ic"><PixelArt art={iconFor(it)} size={28} /></span>
                  <span className="min0"><span className="sug-name">{lang === 'de' ? it.de : it.en}</span><span className="sug-sub">{lang === 'de' ? it.en : it.de} · {it.id}</span></span>
                  <span className="sug-add">+ 1 {t(it.stack > 1 ? 'unit.stack' : 'unit.piece')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sug-empty">
              {t('search.none', { q: q.trim() })}
              {sug && <> {t('search.didYouMean')} <button type="button" className="tlink inline" onMouseDown={(e) => { e.preventDefault(); setQ(lang === 'de' ? sug.de : sug.en); }}>{lang === 'de' ? sug.de : sug.en}</button>?</>}
            </div>
          )}
          <a className="sug-all" href="#items" onMouseDown={(e) => { e.preventDefault(); toShop(); }}>
            <span>{res.length ? t('search.all', { n: res.length.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB') }) : t('search.continue')}</span><Glyph name="arrow" size={14} />
          </a>
        </div>
      )}
    </div>
  );
}

function ThemeButton() {
  const { t, theme, setTheme } = useStore();
  return (
    <button className="theme-btn" type="button" aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      <Glyph name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  );
}

function AccountMenu() {
  const { t, me, mySeller, signOut, mode } = useStore();
  const { go } = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute('open');
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  if (!me) return <Link to={{ page: 'signin' }} className="btn btn-secondary btn-sm">{t('nav.signIn')}</Link>;
  return (
    <details className="acct" ref={ref}>
      <summary className="hl" aria-label={t('nav.account', { name: me.mcName })}><Glyph name="user" size={16} /><span className="hl-text mc">{me.mcName}</span></summary>
      <div className="acct-menu" role="menu">
        <Link role="menuitem" to={{ page: 'orders' }} onClick={close}>{t('nav.myOrders')}</Link>
        <Link role="menuitem" to={{ page: 'notices' }} onClick={close}>{t('nav.notices')}</Link>
        {mySeller && <Link role="menuitem" to={{ page: 'backstage' }} onClick={close}>{t('nav.backstage')}</Link>}
        <Link role="menuitem" to={{ page: 'account' }} onClick={close}>{t('nav.myData')}</Link>
        {mode === 'beta' && <Link role="menuitem" to={{ page: 'beta' }} onClick={close}>{t('nav.betaTools')}</Link>}
        <button role="menuitem" type="button" onClick={async () => { close(); await signOut(); go({ page: 'home' }); }}>{t('nav.signOut')}</button>
      </div>
    </details>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang, me, mySeller, db, toasts, closeToast, cart, cartBump, mode } = useStore();
  const { route } = useRouter();
  const status = useShopStatus();
  const unread = me ? db.notices.filter((n) => n.accountId === me.id && !n.read).length : 0;
  const newOrders = mySeller ? db.orders.filter((o) => o.sellerId === mySeller.id && o.status === 'received').length : 0;
  const [bump, setBump] = useState(false);
  useEffect(() => { if (!cartBump) return; setBump(true); const id = window.setTimeout(() => setBump(false), 450); return () => window.clearTimeout(id); }, [cartBump]);
  const cur = (p: string) => (route.page === p ? 'page' : undefined);

  return (
    <div className="app">
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <div className="topbar">
      <div className="wip" role="region" aria-label={t('wip.label')}>
        <div className="wrap wip-in">
          <div className="wip-card">
            <span className="wip-ic" aria-hidden="true"><Glyph name="info" size={20} color="#16141b" /></span>
            <div>
              <p className="wip-title">{t('wip.title')}</p>
              <p className="wip-body">{t(mode === 'live' ? 'wip.bodyLive' : 'wip.body')}</p>
            </div>
          </div>
        </div>
      </div>
      <header className="hdr">
        <div className="wrap hdr-row">
          <Link to={{ page: 'home' }} className="logo" aria-label={t('nav.homeLabel')}><Logo /><span aria-hidden="true">Stackr</span></Link>
          <HeaderSearch />
          <span className={`status ${status.away ? 'away' : ''}`}><i aria-hidden="true" />{status.text}</span>
          <ThemeButton />
          <nav className="hnav" aria-label={t('nav.account.label')}>
            {me && <Link to={{ page: 'orders' }} className="hl" aria-current={cur('orders')}><Glyph name="list" /><span className="hl-text">{t('nav.myOrders')}</span></Link>}
            {me && (
              <Link to={{ page: 'notices' }} className="hl" aria-current={cur('notices')} aria-label={t('nav.noticesN', { n: unread })}>
                <Glyph name="bell" /><span className="hl-text">{t('nav.notices')}</span>{unread > 0 && <span className="pip num">{unread}</span>}
              </Link>
            )}
            <Link to={{ page: 'items' }} anchor="cart" className={`cartbtn ${bump ? 'bump' : ''}`} aria-label={t('nav.cartN', { n: cart.length })}>
              <Glyph name="cart" size={18} /><span className="hl-text">{t('nav.cart')}</span><span className="n">{cart.length}</span>
            </Link>
            <AccountMenu />
          </nav>
        </div>
        <nav className="wrap subnav" aria-label={t('nav.main')}>
          <Link to={{ page: 'items' }} aria-current={cur('items')}>{t('nav.items')}</Link>
          <Link to={{ page: 'farm', id: 'iron' }} aria-current={route.page === 'farm' && route.id !== 'custom' ? 'page' : undefined}>{t('nav.farms')}</Link>
          <Link to={{ page: 'farm', id: 'custom' }} aria-current={route.page === 'farm' && route.id === 'custom' ? 'page' : undefined}>{t('nav.custom')}</Link>
          <Link to={{ page: 'home' }} anchor="ablauf">{t('nav.how')}</Link>
          <Link to={{ page: 'terms' }} aria-current={cur('terms')}>{t('nav.terms')}</Link>
          {mySeller && <Link to={{ page: 'backstage' }} aria-current={['backstage', 'clients', 'settings'].includes(route.page) ? 'page' : undefined}>{t('nav.backstage')}{newOrders > 0 && <span className="pip num">{newOrders}</span>}</Link>}
          <span className="subnav-gap" />
          <div className="lang" role="group" aria-label={t('nav.language')}>
            {(['de', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </nav>
      </header>
      </div>
      <main id="main" tabIndex={-1} aria-busy={mode === 'loading'}>{mode === 'loading' ? <div className="wrap boot" role="status"><span className="t-small mute">{t('common.loading')}</span></div> : children}</main>
      <footer className="foot dark">
        <div className="wrap foot-grid">
          <div className="foot-col" style={{ gap: 14 }}>
            <Link to={{ page: 'home' }} className="logo" style={{ color: '#fff' }} aria-label={t('nav.homeLabel')}><Logo light /><span aria-hidden="true">Stackr</span></Link>
            <p className="t-body" style={{ color: '#d6d4dc', maxWidth: '36ch' }}>{t('foot.about')}</p>
          </div>
          <div className="foot-col"><h3>{t('foot.shop')}</h3><Link to={{ page: 'items' }}>{t('nav.items')}</Link><Link to={{ page: 'farm', id: 'iron' }}>{t('nav.farms')}</Link><Link to={{ page: 'farm', id: 'custom' }}>{t('nav.custom')}</Link></div>
          <div className="foot-col"><h3>{t('foot.account')}</h3>{me ? <Link to={{ page: 'orders' }}>{t('nav.myOrders')}</Link> : <Link to={{ page: 'signin' }}>{t('nav.signIn')}</Link>}<Link to={{ page: 'items' }} anchor="cart">{t('nav.cart')}</Link>{mode === 'beta' && <Link to={{ page: 'beta' }}>{t('nav.betaTools')}</Link>}</div>
          <div className="foot-col"><h3>Stackr</h3><Link to={{ page: 'home' }} anchor="ablauf">{t('nav.how')}</Link><Link to={{ page: 'terms' }}>{t('nav.terms')}</Link><Link to={{ page: 'privacy' }}>{t('nav.privacy')}</Link></div>
        </div>
        <div className="wrap foot-base"><span>{t(mode === 'live' ? 'foot.live' : 'foot.beta')}</span><span>{t('foot.note')}</span></div>
        {route.page === 'home' && <div className="giant" aria-hidden="true">STACKR</div>}
      </footer>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div className="toast" key={x.id}>
            <span className="toast-ic"><Glyph name="check" size={16} color="#fff" /></span>
            <span className="toast-msg">{x.text}</span>
            {x.action && <button className="btn btn-ghost btn-sm" type="button" onClick={() => { x.action!.run(); closeToast(x.id); }}><Glyph name="undo" size={14} />{x.action.label}</button>}
            <button className="icon-btn" type="button" aria-label={t('common.closeNotice')} onClick={() => closeToast(x.id)}><Glyph name="x" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
