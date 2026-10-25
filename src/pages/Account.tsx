import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { Empty, Field, PageHead, fmtDate } from '../ui/components';
import { Glyph, PORTRAIT, PixelArt } from '../ui/Pixel';
import { betaAuth, type Challenge } from '../auth/minecraftAuth';
import { signIn } from '../data/actions';
import { CONFIG } from '../domain/rules';

export function SignInPage() {
  const { t, run, setSession, showToast, cart } = useStore();
  const { go } = useRouter();
  const [name, setName] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name.trim())) { setErr(t('err.badName')); return; }
    setErr(null);
    setChallenge(await betaAuth.start(name.trim()));
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || !(await betaAuth.verify(challenge, code))) { setErr(t('auth.wrongCode')); return; }
    let id = '';
    const r = run(signIn(challenge.mcName, (x) => { id = x; }));
    if (r) { setErr(r); return; }
    setSession(id);
    showToast(t('auth.welcome', { name: challenge.mcName }));
    go(cart.length ? { page: 'items' } : { page: 'home' }, cart.length ? 'cart' : undefined);
  };

  return (
    <div className="wrap shop narrow">
      <PageHead title={t('auth.title')} lead={t('auth.lead')} />
      <div className="auth-grid">
        <div className="card auth-card">
          {!challenge ? (
            <form className="stack" onSubmit={start} noValidate>
              <p className="t-label eyebrow ink2">{t('auth.stepOf', { n: 1 })}</p>
              <Field label={t('auth.name')} htmlFor="a-name" hint={t('auth.nameHint')} error={err}>
                <input className="field" id="a-name" value={name} autoComplete="username" onChange={(e) => setName(e.target.value)} maxLength={16} aria-invalid={!!err} />
              </Field>
              <button type="submit" className="btn btn-primary btn-lg">{t('auth.next')} <Glyph name="arrow" size={14} /></button>
            </form>
          ) : (
            <form className="stack" onSubmit={verify} noValidate>
              <p className="t-label eyebrow ink2">{t('auth.stepOf', { n: 2 })}</p>
              <ol className="steps-list">
                <li>{t('auth.step1')} <span className="mono">{t('auth.server')}</span></li>
                <li>{t('auth.step2')}</li>
                <li>{t('auth.step3')}</li>
              </ol>
              <div className="notice">
                <b>{t('auth.betaCode')}</b> <span className="d-s num code">{challenge.code}</span>
                <p className="t-small ink2" style={{ margin: '4px 0 0' }}>{t('auth.betaNote')}</p>
              </div>
              <Field label={t('auth.code')} htmlFor="a-code" error={err}>
                <input className="field num" id="a-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} aria-invalid={!!err} />
              </Field>
              <div className="row-gap">
                <button type="submit" className="btn btn-primary btn-lg">{t('auth.verify')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setChallenge(null); setCode(''); setErr(null); }}>{t('common.back')}</button>
              </div>
            </form>
          )}
        </div>
        <div className="auth-side" aria-hidden="true">
          <div className="me-photo small"><PixelArt art={PORTRAIT} vb="0 0 8 8" className="me-face" /></div>
          <p className="t-small ink2">{t('auth.privacy')}</p>
        </div>
      </div>
    </div>
  );
}

export function NoticesPage() {
  const { t, db, me, lang, readNotices } = useStore();
  if (!me) return <div className="wrap shop"><Empty title={t('order.signInFirstTitle')} action={<Link to={{ page: 'signin' }} className="btn btn-primary">{t('nav.signIn')}</Link>} /></div>;
  const mine = db.notices.filter((n) => n.accountId === me.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = mine.some((n) => !n.read);
  return (
    <div className="wrap shop narrow">
      <PageHead title={t('notices.title')} lead={t('notices.lead')} aside={unread ? <button type="button" className="btn btn-secondary btn-sm" onClick={readNotices}>{t('notices.markRead')}</button> : undefined} />
      {mine.length === 0 && <Empty title={t('notices.none')} />}
      <ul className="notice-list plain">
        {mine.map((n) => {
          const vars = { ...n.vars } as Record<string, string | number>;
          if (n.key === 'notice.levelUp' && vars.level) vars.level = t(`level.seller.${vars.level}`);
          if (n.key === 'notice.tokenGranted' && vars.type) vars.type = t(`token.${vars.type}`);
          const body = <><span className={`notice-dot ${n.read ? '' : 'on'}`} aria-hidden="true" /><span className="notice-text">{t(n.key, vars)}</span><span className="t-small mute num">{fmtDate(n.at, lang)}</span></>;
          return (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              {n.orderId ? <Link to={{ page: 'order', id: n.orderId }} className="notice-item card">{body}</Link> : <div className="notice-item card">{body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TermsPage() {
  const { t } = useStore();
  const items = ['permission', 'payment', 'cancel', 'approval', 'warranty', 'limits', 'blacklist', 'tokens', 'privacy', 'malicious'];
  return (
    <div className="wrap shop narrow">
      <PageHead crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.terms')}</span></>} title={t('tos.title')} lead={t('tos.lead')} />
      <ol className="tos card">
        {items.map((k) => <li key={k}><b>{t(`tos.${k}.h`)}</b> {t(`tos.${k}.b`, { n: CONFIG.maxOpenOrdersPerClient, d: CONFIG.approvalWindowDays })}</li>)}
      </ol>
    </div>
  );
}
