import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link } from '../ui/router';
import { ConfirmButton, Empty, ErrorLine, PageHead, TokenPill, fmtDate, fmtN } from '../ui/components';
import { ApiError, apiGet, apiPost } from '../data/api';
import { EARN, GIFT_RE, PLANS, SUB_PERIOD_DAYS, TOKEN_PRICE, activeEvent, balance, normGift, type GiftReward } from '../domain/points';
import { unusedTokens } from '../domain/rules';
import type { SubscriptionPlan, TokenType } from '../domain/types';
import { SubNav } from './Backstage';

const SHOP_TOKENS: TokenType[] = ['priority', 'extra_slot', 'high_effort', 'rush'];

/** Points line in a player's history. */
function reasonText(t: ReturnType<typeof useStore>['t'], reason: string, vars?: Record<string, string | number>) {
  const v = { ...vars } as Record<string, string | number>;
  if (typeof v.type === 'string') v.type = t(`token.${v.type}`);
  if (typeof v.plan === 'string') v.plan = t(`plan.${v.plan}`);
  return t(reason, v);
}

function EventBanner() {
  const { t, db, now, lang } = useStore();
  const ev = activeEvent(db, now);
  if (!ev) return null;
  return (
    <p className="event-banner" role="status">
      <b>{t('shop.eventOn', { name: ev.name, x: ev.multiplier })}</b>
      <span className="t-small">{t('shop.eventUntil', { date: fmtDate(ev.endsAt, lang, false) })}</span>
    </p>
  );
}

function RedeemBox() {
  const { t, mode, refresh, showToast } = useStore();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (mode !== 'live') return <p className="t-small mute">{t('gift.betaNote')}</p>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = normGift(code);
    if (!GIFT_RE.test(c)) { setErr(t('err.giftInvalid')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await apiPost<{ reward: GiftReward }>('shop/redeem', { code: c });
      setCode('');
      await refresh();
      showToast(r.reward.kind === 'points' ? t('gift.gotPoints', { n: r.reward.n }) : t('gift.gotToken', { type: t(`token.${r.reward.type}`) }));
    } catch (e2) { setErr(e2 instanceof ApiError ? t(e2.key, e2.vars) : t('err.unknown')); } finally { setBusy(false); }
  };
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <label className="sr" htmlFor="gift-code">{t('gift.label')}</label>
      <input className="field mono gift-field" id="gift-code" placeholder="XXXX-XXXX-XXXX-XXXX" value={code} maxLength={24} autoComplete="off" spellCheck={false}
        onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={!!err} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !code.trim()}>{t('gift.redeem')}</button>
      <ErrorLine msg={err} />
    </form>
  );
}

export function ShopPage() {
  const { t, db, me, run, lang, now, showToast } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const bal = me ? balance(db, me.id) : 0;
  const history = me ? (db.points ?? []).filter((p) => p.accountId === me.id).slice().reverse().slice(0, 40) : [];
  const sub = me ? (db.subscriptions ?? []).find((s) => s.accountId === me.id && !s.cancelledAt && Date.parse(s.endsAt) > now) : undefined;
  const mine = me ? unusedTokens(db, me.id) : [];
  const buy = async (type: TokenType) => {
    const r = await run({ type: 'buyToken', tokenType: type });
    setErr(r);
    if (!r) showToast(t('shop.bought', { type: t(`token.${type}`) }));
  };

  return (
    <div className="wrap shop shop-page">
      <PageHead title={t('shop.title')} lead={t('shop.lead')} />
      <EventBanner />
      <div className="shop-grid">
        <div className="shop-main">
          <section aria-labelledby="h-tokens">
            <h2 className="t-title" id="h-tokens">{t('shop.tokens')}</h2>
            <ErrorLine msg={err} />
            <ul className="plain token-grid">
              {SHOP_TOKENS.map((type) => {
                const price = TOKEN_PRICE[type];
                const short = me ? price - bal : 0;
                return (
                  <li key={type} className="card token-card">
                    <TokenPill token={{ type }} />
                    <p className="t-small ink2">{t(`token.desc.${type}`)}</p>
                    <div className="token-foot">
                      <span className="price num">{t('shop.price', { n: price })}</span>
                      {!me ? <Link to={{ page: 'signin' }} className="btn btn-secondary btn-sm">{t('nav.signIn')}</Link>
                        : short > 0 ? <span className="t-small mute">{t('shop.short', { n: short })}</span>
                        : <ConfirmButton id={`buy-${type}`} className="btn btn-primary btn-sm" label={t('shop.buy')}
                            confirmBody={t('shop.buyBody', { type: t(`token.${type}`), n: price, left: bal - price })} confirmLabel={t('shop.buy')} onConfirm={() => void buy(type)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="h-earn" className="sec-sm">
            <h2 className="t-title" id="h-earn">{t('shop.earn')}</h2>
            <ul className="plain earn-list">
              <li><span>{t('shop.earn.order')}</span><b className="num">+{EARN.order}</b></li>
              <li><span>{t('shop.earn.own')}</span><b className="num">+{EARN.ownMaterials}</b></li>
              <li><span>{t('shop.earn.rating')}</span><b className="num">+{EARN.rating}</b></li>
              <li><span>{t('shop.earn.loyalty', { n: EARN.loyaltyEvery })}</span><b className="num">+{EARN.loyalty}</b></li>
              <li><span>{t('shop.earn.event')}</span><b className="num">×2 / ×3</b></li>
              <li><span>{t('shop.earn.gift')}</span><b className="num">?</b></li>
            </ul>
          </section>

          <section aria-labelledby="h-subs" className="sec-sm">
            <h2 className="t-title" id="h-subs">{t('shop.subs')}</h2>
            <p className="t-small ink2">{t('shop.subsLead', { days: SUB_PERIOD_DAYS })}</p>
            <ul className="plain plan-grid">
              {(Object.keys(PLANS) as SubscriptionPlan[]).map((p) => (
                <li key={p} className={`card plan ${sub?.plan === p ? 'on' : ''}`}>
                  <b>{t(`plan.${p}`)}</b>
                  <span className="t-small ink2">{t('shop.planPoints', { n: PLANS[p].points, days: SUB_PERIOD_DAYS })}</span>
                  {PLANS[p].token && <span className="t-small ink2">{t('shop.planToken', { type: t(`token.${PLANS[p].token}`) })}</span>}
                  {sub?.plan === p && <span className="badge b-ok">{t('shop.planActive', { date: fmtDate(sub.endsAt, lang, false) })}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="card side-frame wallet" aria-labelledby="h-wallet">
          <h2 className="t-label mute" id="h-wallet">{t('shop.balance')}</h2>
          {me ? <>
            <p className="d-l num balance">{fmtN(bal, lang)}</p>
            <p className="t-small mute">{t('shop.credits')}</p>
            {mine.length > 0 && <p className="t-small">{t('shop.ownTokens')} {mine.map((tk) => <TokenPill key={tk.id} token={tk} />)}</p>}
          </> : <p className="t-small ink2">{t('shop.signInFirst')}</p>}
          <div className="wallet-sec">
            <h3 className="t-label mute">{t('gift.title')}</h3>
            {me ? <RedeemBox /> : <p className="t-small mute">{t('gift.signIn')}</p>}
          </div>
          {me && (
            <div className="wallet-sec">
              <h3 className="t-label mute">{t('shop.history')}</h3>
              {history.length === 0 ? <p className="t-small mute">{t('shop.noHistory')}</p> : (
                <ul className="plain ledger">
                  {history.map((p) => (
                    <li key={p.id}>
                      <span className="t-small">{reasonText(t, p.reason, p.vars)}<span className="mute"> · {fmtDate(p.at, lang, false)}</span></span>
                      <b className={`num ${p.delta < 0 ? 'neg' : 'pos'}`}>{p.delta > 0 ? '+' : ''}{p.delta}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Seller: rewards ----------

type Gift = { id: string; hint: string; reward: GiftReward; maxUses: number; uses: number; note: string; createdAt: string; expiresAt: string; active: boolean };

function rewardText(t: ReturnType<typeof useStore>['t'], r: GiftReward) {
  return r.kind === 'points' ? t('shop.price', { n: r.n }) : t(`token.${r.type}`);
}

function GiftCodes() {
  const { t, lang, showToast } = useStore();
  const [kind, setKind] = useState<'points' | 'token'>('points');
  const [n, setN] = useState('50');
  const [type, setType] = useState<TokenType>('priority');
  const [uses, setUses] = useState('1');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [made, setMade] = useState<{ code: string; expiresAt: string } | null>(null);
  const [list, setList] = useState<Gift[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = React.useCallback(() => { apiGet<{ gifts: Gift[] }>('seller/gifts').then((r) => setList(r.data?.gifts ?? []), () => {}); }, []);
  React.useEffect(load, [load]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const reward: GiftReward = kind === 'points' ? { kind, n: Number(n) } : { kind, type };
    try {
      const r = await apiPost<{ code: string; expiresAt: string }>('seller/gift', { reward, uses: Number(uses), days: Number(days), note: note.trim() });
      setMade(r); setNote(''); load();
    } catch (e2) { setErr(e2 instanceof ApiError ? t(e2.key, e2.vars) : t('err.invalidInput')); }
  };
  return (
    <section className="card form-card" aria-labelledby="h-gifts">
      <h2 className="t-title" id="h-gifts">{t('gift.sellerTitle')}</h2>
      <p className="t-small ink2">{t('gift.sellerLead')}</p>
      <form className="form-grid" onSubmit={create} noValidate>
        <label className="fl"><span className="t-label">{t('gift.kind')}</span>
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value as 'points' | 'token')}>
            <option value="points">{t('shop.credits')}</option><option value="token">{t('gift.kindToken')}</option>
          </select></label>
        {kind === 'points'
          ? <label className="fl"><span className="t-label">{t('gift.amount')}</span><input className="field num" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
          : <label className="fl"><span className="t-label">{t('bs.tokenType')}</span>
              <select className="field" value={type} onChange={(e) => setType(e.target.value as TokenType)}>{SHOP_TOKENS.map((x) => <option key={x} value={x}>{t(`token.${x}`)}</option>)}</select></label>}
        <label className="fl"><span className="t-label">{t('gift.uses')}</span><input className="field num" inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
        <label className="fl"><span className="t-label">{t('gift.days')}</span><input className="field num" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
        <label className="fl wide"><span className="t-label">{t('gift.note')}</span><input className="field" value={note} maxLength={60} placeholder={t('gift.notePh')} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="submit" className="btn btn-primary btn-sm">{t('gift.create')}</button>
      </form>
      <ErrorLine msg={err} />
      {made && (
        <div className="code-box" role="status">
          <p className="t-label mute">{t('gift.madeTitle')}</p>
          <p className="d-s num mono code-big">{made.code}</p>
          <p className="t-small ink2">{t('gift.madeBody', { date: fmtDate(made.expiresAt, lang, false) })}</p>
          <div className="row-gap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard?.writeText(made.code).then(() => showToast(t('auth.copied')), () => {})}>{t('gift.copy')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMade(null)}>{t('common.close')}</button>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <ul className="plain inv-list gift-list">
          {list.map((g) => (
            <li key={g.id} className={g.active ? '' : 'off'}>
              <span className="mono">…-{g.hint}</span>
              <span className="t-small">{rewardText(t, g.reward)} · {t('gift.used', { n: g.uses, max: g.maxUses })}{g.note && <span className="mute"> · {g.note}</span>}</span>
              <span className="t-small mute">{g.active ? t('inv.until', { date: fmtDate(g.expiresAt, lang, false) }) : t('gift.inactive')}</span>
              {g.active && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await apiPost('seller/gift/revoke', { id: g.id }).catch(() => {}); load(); }}>{t('inv.revoke')}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventsCard() {
  const { t, db, now, run, lang } = useStore();
  const [name, setName] = useState('');
  const [mult, setMult] = useState(2);
  const [days, setDays] = useState('7');
  const [err, setErr] = useState<string | null>(null);
  const ev = activeEvent(db, now);
  return (
    <section className="card form-card" aria-labelledby="h-events">
      <h2 className="t-title" id="h-events">{t('event.title')}</h2>
      <p className="t-small ink2">{t('event.lead')}</p>
      {ev && (
        <div className="event-now">
          <span><b>{ev.name}</b> · ×{ev.multiplier} · {t('shop.eventUntil', { date: fmtDate(ev.endsAt, lang, false) })}</span>
          <button type="button" className="btn btn-ghost btn-sm danger" onClick={async () => setErr(await run({ type: 'endEvent' }))}>{t('event.end')}</button>
        </div>
      )}
      <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); const r = await run({ type: 'startEvent', name, multiplier: mult, days: Number(days) }); setErr(r); if (!r) setName(''); }} noValidate>
        <label className="fl wide"><span className="t-label">{t('event.name')}</span><input className="field" value={name} maxLength={60} placeholder={t('event.namePh')} onChange={(e) => setName(e.target.value)} /></label>
        <label className="fl"><span className="t-label">{t('event.mult')}</span>
          <select className="field" value={mult} onChange={(e) => setMult(Number(e.target.value))}><option value={2}>×2</option><option value={3}>×3</option></select></label>
        <label className="fl"><span className="t-label">{t('gift.days')}</span><input className="field num" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>{ev ? t('event.replace') : t('event.start')}</button>
      </form>
      <ErrorLine msg={err} />
    </section>
  );
}

function ClientRewards() {
  const { t, db, now, run, lang, showToast, mySeller } = useStore();
  const clients = db.accounts.filter((a) => !a.sellerId && !a.deletedAt && !a.disabledAt).sort((a, b) => a.mcName.localeCompare(b.mcName));
  const [who, setWho] = useState('');
  const [n, setN] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('regular');
  const [months, setMonths] = useState('1');
  const [err, setErr] = useState<string | null>(null);
  if (!mySeller) return null;
  const c = clients.find((a) => a.id === who);
  const sub = c ? (db.subscriptions ?? []).find((s) => s.accountId === c.id && !s.cancelledAt && Date.parse(s.endsAt) > now) : undefined;
  const subs = (db.subscriptions ?? []).filter((s) => !s.cancelledAt && Date.parse(s.endsAt) > now);
  return (
    <section className="card form-card" aria-labelledby="h-crew">
      <h2 className="t-title" id="h-crew">{t('rewards.clients')}</h2>
      <label className="fl"><span className="t-label">{t('rewards.pick')}</span>
        <select className="field" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">—</option>
          {clients.map((a) => <option key={a.id} value={a.id}>{a.mcName} ({fmtN(balance(db, a.id), lang)})</option>)}
        </select></label>
      {c && <>
        <p className="t-small ink2">{t('rewards.balance', { name: c.mcName, n: balance(db, c.id) })}</p>
        <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); const r = await run({ type: 'grantPoints', clientId: c.id, n: Number(n), note }); setErr(r); if (!r) { showToast(t('rewards.granted', { n, name: c.mcName })); setN(''); setNote(''); } }} noValidate>
          <label className="fl"><span className="t-label">{t('rewards.points')}</span><input className="field num" inputMode="numeric" placeholder="+50 / -20" value={n} onChange={(e) => setN(e.target.value.replace(/[^\d-]/g, '').slice(0, 6))} /></label>
          <label className="fl wide"><span className="t-label">{t('gift.note')}</span><input className="field" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!n || n === '-'}>{t('rewards.book')}</button>
        </form>
        <div className="sub-row">
          {sub ? <>
            <span className="t-small">{t('rewards.subActive', { plan: t(`plan.${sub.plan}`), date: fmtDate(sub.endsAt, lang, false) })}</span>
            <ConfirmButton id="sub-cancel" className="btn btn-ghost btn-sm danger" label={t('rewards.subCancel')} confirmBody={t('rewards.subCancelBody', { name: c.mcName })} confirmLabel={t('rewards.subCancel')}
              onConfirm={async () => setErr(await run({ type: 'cancelSubscription', clientId: c.id }))} />
          </> : (
            <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); const r = await run({ type: 'setSubscription', clientId: c.id, plan, months: Number(months) }); setErr(r); if (!r) showToast(t('rewards.subStarted', { name: c.mcName })); }} noValidate>
              <label className="fl"><span className="t-label">{t('rewards.plan')}</span>
                <select className="field" value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>{(Object.keys(PLANS) as SubscriptionPlan[]).map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}</select></label>
              <label className="fl"><span className="t-label">{t('rewards.months')}</span>
                <select className="field" value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <button type="submit" className="btn btn-secondary btn-sm">{t('rewards.subStart')}</button>
            </form>
          )}
        </div>
      </>}
      <ErrorLine msg={err} />
      {subs.length > 0 && (
        <div className="wallet-sec">
          <h3 className="t-label mute">{t('rewards.subsNow')}</h3>
          <ul className="plain inv-list">
            {subs.map((s) => <li key={s.accountId}><span className="mc">{db.accounts.find((a) => a.id === s.accountId)?.mcName ?? '?'}</span><span className="t-small">{t(`plan.${s.plan}`)}</span><span className="t-small mute">{t('inv.until', { date: fmtDate(s.endsAt, lang, false) })}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export function RewardsPage() {
  const { t, mySeller, mode } = useStore();
  if (!mySeller) return <div className="wrap shop"><Empty title={t('bs.notSeller')} /></div>;
  return (
    <div className="wrap back">
      <PageHead title={t('bs.tab.rewards')} lead={t('rewards.lead')} aside={<SubNav />} />
      <div className="rewards-grid">
        {mode === 'live' ? <GiftCodes /> : <section className="card form-card"><h2 className="t-title">{t('gift.sellerTitle')}</h2><p className="t-small mute">{t('gift.betaNote')}</p></section>}
        <EventsCard />
        <ClientRewards />
      </div>
    </div>
  );
}
