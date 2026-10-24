import React from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from './router';

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang, me, mySeller, db, toast, setSession } = useStore();
  const { route, go } = useRouter();
  const unread = me ? db.notices.filter((n) => n.accountId === me.id && !n.read).length : 0;
  const newOrders = mySeller ? db.orders.filter((o) => o.sellerId === mySeller.id && o.status === 'received').length : 0;
  const is = (...pages: string[]) => pages.includes(route.page);

  return (
    <div className="app">
      <div className="beta-bar">
        <div className="wrap">
          <span><strong>Beta 1.0</strong> · {t('beta.bar')}</span>
          <Link to={{ page: 'beta' }}>{t('nav.betaTools')}</Link>
        </div>
      </div>
      <header className="top">
        <div className="wrap top-row">
          <Link to={{ page: 'home' }} className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>{t('brand')}</span>
          </Link>
          <div className="top-tools">
            <div className="lang" role="group" aria-label={t('nav.language')}>
              {(['de', 'en'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
            {me ? (
              <>
                <Link to={{ page: 'notices' }} className="bell">
                  {t('nav.notices')}{unread > 0 && <span className="count">{unread}</span>}
                </Link>
                <button type="button" className="btn ghost small" onClick={() => { setSession(null); go({ page: 'home' }); }}>
                  <span className="mc">{me.mcName}</span> · {t('nav.signOut')}
                </button>
              </>
            ) : (
              <Link to={{ page: 'signin' }} className="btn small">{t('nav.signIn')}</Link>
            )}
          </div>
        </div>
        <nav className="wrap tabs" aria-label={t('nav.main')}>
          <Link to={{ page: 'home' }} className={is('home', 'seller', 'new') ? 'active' : ''}>{t('nav.sellers')}</Link>
          {me && <Link to={{ page: 'orders' }} className={is('orders') ? 'active' : ''}>{t('nav.myOrders')}</Link>}
          {mySeller && (
            <Link to={{ page: 'backstage' }} className={is('backstage', 'clients', 'settings') ? 'active' : ''}>
              {t('nav.backstage')}{newOrders > 0 && <span className="count">{newOrders}</span>}
            </Link>
          )}
          <Link to={{ page: 'terms' }} className={is('terms') ? 'active' : ''}>{t('nav.terms')}</Link>
        </nav>
      </header>
      <main className="wrap main">{children}</main>
      <footer className="wrap foot">
        <span>{t('foot.server')}</span>
        <span className="muted">{t('foot.note')}</span>
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
