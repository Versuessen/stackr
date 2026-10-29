import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { ConfirmButton, Empty, ErrorLine, Field, PageHead, fmtDate } from '../ui/components';
import { Glyph, PORTRAIT, PixelArt } from '../ui/Pixel';
import { betaAuth, type Challenge } from '../auth/minecraftAuth';
import { ApiError, apiPost } from '../data/api';
import { resetTo } from '../data/actions';
import { CONFIG } from '../domain/rules';
import { RETENTION_DAYS } from '../data/actions';

const errText = (t: (k: string, v?: Record<string, string | number>) => string, e: unknown) =>
  e instanceof ApiError ? t(e.key, e.vars) : e instanceof TypeError ? t('err.offline') : t('err.unknown');

function AuthAside() {
  const { t } = useStore();
  return (
    <div className="auth-side">
      <div className="me-photo small" aria-hidden="true"><PixelArt art={PORTRAIT} vb="0 0 8 8" className="me-face" /></div>
      <p className="t-small ink2">{t('auth.privacy')} <Link to={{ page: 'privacy' }} className="tlink">{t('nav.privacy')}</Link></p>
    </div>
  );
}

export function SignInPage() {
  const { mode, live, me, t } = useStore();
  if (mode === 'live' && live?.mfa) return <SecondFactorPage />;
  if (me) {
    return (
      <div className="wrap shop narrow">
        <PageHead title={t('auth.title')} />
        <Empty title={t('auth.already', { name: me.mcName })} action={<Link to={{ page: 'orders' }} className="btn btn-primary">{t('nav.myOrders')}</Link>} />
      </div>
    );
  }
  return mode === 'live' ? <LiveSignIn /> : <BetaSignIn />;
}

function afterSignIn(go: ReturnType<typeof useRouter>['go'], cartItems: number, seller: boolean) {
  if (seller) go({ page: 'backstage' });
  else go(cartItems ? { page: 'items' } : { page: 'home' }, cartItems ? 'cart' : undefined);
}

type AuthTab = 'login' | 'register' | 'reset';

function PasswordField({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const { t } = useStore();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="pw-wrap">
        <input className="field" id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} maxLength={128} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm pw-toggle" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? t('auth.hide') : t('auth.show')}</button>
      </div>
    </Field>
  );
}

function LiveSignIn() {
  const { t, db, refresh, showToast, cart } = useStore();
  const { go } = useRouter();
  const inviteOnly = db.sellers.some((x) => x.inviteOnly);
  const [tab, setTab] = useState<AuthTab>('login');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTab = (x: AuthTab) => { setTab(x); setErr(null); setPw(''); setPw2(''); setCode(''); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { setErr(t('err.badName')); return; }
    if (tab !== 'login' && pw.length < 10) { setErr(t('err.pwShort')); return; }
    if (tab !== 'login' && pw !== pw2) { setErr(t('err.pwMismatch')); return; }
    if (tab === 'register' && inviteOnly && !code.trim()) { setErr(t('err.inviteRequired')); return; }
    if (tab === 'reset' && !code.trim()) { setErr(t('err.codeInvalid')); return; }
    setBusy(true); setErr(null);
    try {
      const path = tab === 'login' ? 'auth/login' : tab === 'register' ? 'auth/register' : 'auth/reset';
      const body = tab === 'login' ? { name: n, password: pw } : { name: n, password: pw, code: code.trim() || undefined };
      const r = await apiPost<{ mfa: string | null; mcName: string; confirmed?: boolean }>(path, body);
      await refresh();
      if (r.mfa) return; // seller: the 2FA step renders next
      showToast(t(tab === 'register' ? (r.confirmed ? 'auth.welcomeConfirmed' : 'auth.welcomeNew') : 'auth.welcome', { name: r.mcName }));
      afterSignIn(go, cart.length, false);
    } catch (e2) { setErr(errText(t, e2)); } finally { setBusy(false); }
  };

  return (
    <div className="wrap shop narrow">
      <PageHead title={t('auth.title')} lead={t('auth.leadPw')} />
      <div className="auth-grid">
        <div className="card auth-card stack">
          <div className="seg auth-tabs" role="radiogroup" aria-label={t('auth.title')}>
            {(['login', 'register', 'reset'] as const).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={tab === x} onClick={() => switchTab(x)}>{t(`auth.tab.${x}`)}</button>
            ))}
          </div>
          {tab === 'register' && <p className="t-small ink2" style={{ margin: 0 }}>{t(inviteOnly ? 'auth.registerLeadInvite' : 'auth.registerLead')}</p>}
          {tab === 'reset' && <p className="t-small ink2" style={{ margin: 0 }}>{t('auth.resetLead')}</p>}
          <form className="stack" onSubmit={submit} noValidate>
            <Field label={t('auth.name')} htmlFor="a-name" hint={tab === 'register' ? t('auth.nameHintPw') : undefined}>
              <input className="field mc" id="a-name" value={name} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={16} onChange={(e) => setName(e.target.value)} />
            </Field>
            <PasswordField id="a-pw" label={tab === 'login' ? t('auth.password') : t('auth.newPassword')} value={pw} onChange={setPw}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'} hint={tab === 'login' ? undefined : t('auth.pwHint')} />
            {tab !== 'login' && <PasswordField id="a-pw2" label={t('auth.repeatPassword')} value={pw2} onChange={setPw2} autoComplete="new-password" />}
            {tab !== 'login' && (
              <Field label={tab === 'reset' ? t('auth.resetCode') : inviteOnly ? t('auth.inviteCode') : t('auth.inviteCodeOptional')} htmlFor="a-code"
                hint={tab === 'register' ? t('auth.inviteHint') : undefined}>
                <input className="field mono" id="a-code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} onChange={(e) => setCode(e.target.value)} />
              </Field>
            )}
            <ErrorLine msg={err} />
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} aria-busy={busy}>
              {t(tab === 'login' ? 'auth.verify' : tab === 'register' ? 'auth.create' : 'auth.setPassword')} <Glyph name="arrow" size={14} />
            </button>
            {tab === 'login' && <p className="t-small mute" style={{ margin: 0 }}><button type="button" className="tlink linkish" onClick={() => switchTab('reset')}>{t('auth.forgot')}</button></p>}
          </form>
        </div>
        <AuthAside />
      </div>
    </div>
  );
}

function BetaSignIn() {
  const { t, betaSignIn, showToast, cart } = useStore();
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
    const r = betaSignIn(challenge.mcName);
    if (r) { setErr(r); return; }
    showToast(t('auth.welcome', { name: challenge.mcName }));
    afterSignIn(go, cart.length, false);
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
        <AuthAside />
      </div>
    </div>
  );
}

/** Seller only: authenticator code (or a recovery code), or the one-time setup. */
function SecondFactorPage() {
  const { t, live, refresh, showToast, signOut } = useStore();
  const { go } = useRouter();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qr: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const name = live?.pending?.mcName ?? '';

  const done = async () => { await refresh(); showToast(t('auth.welcome', { name })); go({ page: 'backstage' }); };
  const call = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };

  if (recovery) {
    return (
      <div className="wrap shop narrow">
        <PageHead title={t('mfa.recoveryTitle')} lead={t('mfa.recoveryLead')} />
        <div className="card auth-card stack">
          <ol className="recovery-codes num mono">{recovery.map((c) => <li key={c}>{c}</li>)}</ol>
          <div className="row-gap">
            <button type="button" className="btn btn-secondary" onClick={() => void navigator.clipboard?.writeText(recovery.join('\n')).then(() => showToast(t('auth.copied')), () => {})}>{t('mfa.copyAll')}</button>
            <button type="button" className="btn btn-primary" onClick={() => void done()}>{t('mfa.saved')}</button>
          </div>
        </div>
      </div>
    );
  }

  const enroll = live?.mfa === 'enroll';
  return (
    <div className="wrap shop narrow">
      <PageHead title={enroll ? t('mfa.setupTitle') : t('mfa.title')} lead={enroll ? t('mfa.setupLead') : t('mfa.lead', { name })} />
      <div className="auth-grid">
        <div className="card auth-card">
          {enroll && !setup ? (
            <div className="stack">
              <ol className="steps-list">
                <li>{t('mfa.setup1')}</li>
                <li>{t('mfa.setup2')}</li>
                <li>{t('mfa.setup3')}</li>
              </ol>
              <ErrorLine msg={err} />
              <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void call(async () => setSetup(await apiPost('auth/enroll/start')))}>{t('mfa.start')}</button>
            </div>
          ) : (
            <form className="stack" noValidate onSubmit={(e) => {
              e.preventDefault();
              void call(async () => {
                if (enroll) {
                  const r = await apiPost<{ recovery: string[] }>('auth/enroll/confirm', { code });
                  setRecovery(r.recovery);
                } else {
                  await apiPost('auth/totp', useRecovery ? { recovery: code } : { code });
                  await done();
                }
              });
            }}>
              {setup && (
                <div className="qr-box">
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr)}`} width={200} height={200} alt={t('mfa.qrAlt')} />
                  <p className="t-small ink2">{t('mfa.manual')} <span className="mono secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</span></p>
                </div>
              )}
              <Field label={useRecovery ? t('mfa.recoveryLabel') : t('mfa.codeLabel')} htmlFor="m-code" error={err}>
                <input className="field num code-input" id="m-code" autoFocus inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)} maxLength={useRecovery ? 20 : 7} aria-invalid={!!err} />
              </Field>
              <div className="row-gap">
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy} aria-busy={busy}>{enroll ? t('mfa.confirm') : t('auth.verify')}</button>
                {!enroll && <button type="button" className="btn btn-ghost" onClick={() => { setUseRecovery((v) => !v); setCode(''); setErr(null); }}>{useRecovery ? t('mfa.useApp') : t('mfa.useRecovery')}</button>}
              </div>
            </form>
          )}
          <p className="t-small mute" style={{ marginTop: 16 }}><button type="button" className="tlink linkish" onClick={() => void signOut()}>{t('mfa.cancel')}</button></p>
        </div>
        <div className="auth-side"><p className="t-small ink2">{t('mfa.why')}</p></div>
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
        {items.map((k) => <li key={k}><b>{t(`tos.${k}.h`)}</b> {t(`tos.${k}.b`, { n: CONFIG.maxOpenOrdersPerClient, d: CONFIG.approvalWindowDays })}{k === 'privacy' && <> <Link to={{ page: 'privacy' }} className="tlink">{t('nav.privacy')}</Link></>}</li>)}
      </ol>
    </div>
  );
}

const PRIVACY_SECTIONS = ['who', 'what', 'why', 'see', 'cookies', 'keep', 'processors', 'rights', 'security'] as const;
export const PRIVACY_UPDATED = '2026-10-29';

export function PrivacyPage() {
  const { t, db, lang } = useStore();
  const seller = db.sellers[0]?.displayName ?? '—';
  const contact = (import.meta.env.VITE_PRIVACY_CONTACT as string | undefined)?.trim();
  const vars = { seller, contact: contact || t('privacy.contactFallback', { seller }), days: RETENTION_DAYS };
  return (
    <div className="wrap shop narrow">
      <PageHead crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.privacy')}</span></>}
        title={t('privacy.title')} lead={t('privacy.lead')} />
      <div className="card prose">
        {PRIVACY_SECTIONS.map((k) => (
          <section key={k} aria-labelledby={`p-${k}`}>
            <h2 className="t-title" id={`p-${k}`}>{t(`privacy.${k}.h`)}</h2>
            {t(`privacy.${k}.b`, vars).split('\n').map((line, i) => line.startsWith('• ') ? <p key={i} className="li">{line.slice(2)}</p> : <p key={i}>{line}</p>)}
          </section>
        ))}
        <p className="t-small mute">{t('privacy.updated', { date: fmtDate(PRIVACY_UPDATED, lang, false) })}</p>
        <p><Link to={{ page: 'account' }} className="btn btn-secondary">{t('nav.myData')}</Link></p>
      </div>
    </div>
  );
}

/** "Meine Daten": export, sign out everywhere, erase the account. */
export function MyDataPage() {
  const { t, me, mode, db, signOut, refresh, showToast, replace, setSession } = useStore();
  const { go } = useRouter();
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!me) return <div className="wrap shop"><Empty title={t('order.signInFirstTitle')} action={<Link to={{ page: 'signin' }} className="btn btn-primary">{t('nav.signIn')}</Link>} /></div>;
  const openOrders = db.orders.some((o) => o.clientId === me.id && ['received', 'cleared', 'processing', 'fulfilling', 'delivered'].includes(o.status));

  const erase = async () => {
    setErr(null);
    if (mode !== 'live') {
      replace(resetTo('examples')()); setSession(null); showToast(t('data.betaCleared')); go({ page: 'home' }); return;
    }
    try {
      await apiPost('me/delete', { confirm });
      await refresh();
      showToast(t('data.deleted'));
      go({ page: 'home' });
    } catch (e) { setErr(errText(t, e)); }
  };

  return (
    <div className="wrap shop narrow stack">
      <PageHead title={t('data.title')} lead={t('data.lead', { name: me.mcName })} />
      {mode !== 'live' && <p className="notice">{t('data.betaNote')}</p>}
      <section className="card form-card" aria-labelledby="d-export">
        <h2 className="t-title" id="d-export">{t('data.exportTitle')}</h2>
        <p className="t-small ink2">{t('data.exportBody')}</p>
        <div className="row-gap">
          {mode === 'live'
            ? <a className="btn btn-secondary" href="/api/me/export" download>{t('data.exportBtn')}</a>
            : <button type="button" className="btn btn-secondary" disabled>{t('data.exportBtn')}</button>}
        </div>
      </section>
      {mode === 'live' && <ChangePassword />}
      {mode === 'live' && (
        <section className="card form-card" aria-labelledby="d-sessions">
          <h2 className="t-title" id="d-sessions">{t('data.sessionsTitle')}</h2>
          <p className="t-small ink2">{t('data.sessionsBody')}</p>
          <div className="row-gap"><button type="button" className="btn btn-secondary" onClick={async () => { await signOut(true); showToast(t('data.signedOutAll')); go({ page: 'home' }); }}>{t('data.signOutAll')}</button></div>
        </section>
      )}
      {!me.sellerId && (
        <section className="card form-card" aria-labelledby="d-delete">
          <h2 className="t-title" id="d-delete">{t('data.deleteTitle')}</h2>
          <p className="t-small ink2">{t('data.deleteBody')}</p>
          {openOrders ? <p className="notice warn">{t('err.openOrders')}</p> : (
            <>
              {mode === 'live' && (
                <Field label={t('data.deleteConfirm', { name: me.mcName })} htmlFor="d-name">
                  <input className="field" id="d-name" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" maxLength={16} />
                </Field>
              )}
              <ErrorLine msg={err} />
              <div className="row-gap">
                <ConfirmButton id="d-erase" className="btn btn-ghost danger" label={t('data.deleteBtn')} confirmBody={t('data.deleteSure')} confirmLabel={t('data.deleteBtn')} onConfirm={() => { void erase(); }} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ChangePassword() {
  const { t, showToast } = useStore();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) { setErr(t('err.pwShort')); return; }
    if (pw !== pw2) { setErr(t('err.pwMismatch')); return; }
    setErr(null);
    try { await apiPost('auth/password', { current: cur, password: pw }); setCur(''); setPw(''); setPw2(''); showToast(t('data.pwChanged')); }
    catch (e2) { setErr(errText(t, e2)); }
  };
  return (
    <section className="card form-card" aria-labelledby="d-pw">
      <h2 className="t-title" id="d-pw">{t('data.pwTitle')}</h2>
      <p className="t-small ink2">{t('data.pwBody')}</p>
      <form className="stack-sm" onSubmit={submit} noValidate>
        <input type="text" autoComplete="username" hidden readOnly value="" />
        <PasswordField id="d-cur" label={t('auth.currentPassword')} value={cur} onChange={setCur} autoComplete="current-password" />
        <PasswordField id="d-new" label={t('auth.newPassword')} value={pw} onChange={setPw} autoComplete="new-password" hint={t('auth.pwHint')} />
        <PasswordField id="d-new2" label={t('auth.repeatPassword')} value={pw2} onChange={setPw2} autoComplete="new-password" />
        <ErrorLine msg={err} />
        <div className="row-gap"><button type="submit" className="btn btn-secondary">{t('data.pwSave')}</button></div>
      </form>
    </section>
  );
}
