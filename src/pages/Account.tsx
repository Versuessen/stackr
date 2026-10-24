import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { Empty, ErrorLine, Field, fmtDate } from '../ui/components';
import { betaAuth, type Challenge } from '../auth/minecraftAuth';
import { signIn } from '../data/actions';

export function SignInPage() {
  const { t, run, setSession, showToast } = useStore();
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
    go({ page: 'home' });
  };

  return (
    <section className="stack narrow">
      <div className="page-head">
        <h1>{t('auth.title')}</h1>
        <p className="lead">{t('auth.lead')}</p>
      </div>
      {!challenge ? (
        <form className="card form" onSubmit={start}>
          <Field label={t('auth.name')} htmlFor="a-name" hint={t('auth.nameHint')}>
            <input id="a-name" value={name} autoComplete="username" onChange={(e) => setName(e.target.value)} maxLength={16} />
          </Field>
          <ErrorLine msg={err} />
          <div className="actions"><button type="submit" className="btn primary">{t('auth.next')}</button></div>
        </form>
      ) : (
        <form className="card form" onSubmit={verify}>
          <ol className="steps-list">
            <li>{t('auth.step1')} <span className="mono">{t('auth.server')}</span></li>
            <li>{t('auth.step2')}</li>
            <li>{t('auth.step3')}</li>
          </ol>
          <div className="notice">
            <strong>{t('auth.betaCode')}</strong> <span className="mono code">{challenge.code}</span>
            <div className="small muted">{t('auth.betaNote')}</div>
          </div>
          <Field label={t('auth.code')} htmlFor="a-code">
            <input id="a-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} />
          </Field>
          <ErrorLine msg={err} />
          <div className="actions">
            <button type="submit" className="btn primary">{t('auth.verify')}</button>
            <button type="button" className="btn ghost" onClick={() => { setChallenge(null); setCode(''); }}>{t('common.back')}</button>
          </div>
        </form>
      )}
      <p className="muted small">{t('auth.privacy')}</p>
    </section>
  );
}

export function NoticesPage() {
  const { t, db, me, lang, readNotices } = useStore();
  if (!me) return <Empty><Link to={{ page: 'signin' }}>{t('order.signInFirst')}</Link></Empty>;
  const mine = db.notices.filter((n) => n.accountId === me.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = mine.some((n) => !n.read);
  return (
    <section className="stack">
      <div className="page-head row-between">
        <h1>{t('notices.title')}</h1>
        {unread && <button type="button" className="btn ghost small" onClick={readNotices}>{t('notices.markRead')}</button>}
      </div>
      <p className="muted small">{t('notices.lead')}</p>
      {mine.length === 0 && <Empty>{t('notices.none')}</Empty>}
      <ul className="notice-list">
        {mine.map((n) => {
          const vars = { ...n.vars } as Record<string, string | number>;
          if (n.key === 'notice.levelUp' && vars.level) vars.level = t(`level.seller.${vars.level}`);
          if (n.key === 'notice.tokenGranted' && vars.type) vars.type = t(`token.${vars.type}`);
          const body = <><span className="notice-text">{t(n.key, vars)}</span><span className="mono small muted">{fmtDate(n.at, lang)}</span></>;
          return (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              {n.orderId ? <Link to={{ page: 'order', id: n.orderId }} className="notice-item">{body}</Link> : <div className="notice-item">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TermsPage() {
  const { t } = useStore();
  const items = ['permission', 'payment', 'cancel', 'approval', 'warranty', 'limits', 'blacklist', 'tokens', 'privacy', 'malicious'];
  return (
    <section className="stack narrow">
      <div className="page-head">
        <h1>{t('tos.title')}</h1>
        <p className="lead">{t('tos.lead')}</p>
      </div>
      <ol className="tos">
        {items.map((k) => <li key={k}><strong>{t(`tos.${k}.h`)}</strong> {t(`tos.${k}.b`)}</li>)}
      </ol>
    </section>
  );
}
