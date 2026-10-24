import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { Empty, ErrorLine, Field, Stars, fmtDate } from '../ui/components';
import { OrderRow } from './Orders';
import {
  advanceClock, blacklistClient, clearBlacklist, grantToken, resetTo, setVacation, toggleService, updateSeller,
} from '../data/actions';
import { DAY, activeBlacklist, clientStats, publicWaitDays, sellerQueue, sellerStats, unusedTokens } from '../domain/rules';
import type { DB, TokenType } from '../domain/types';

function SubNav() {
  const { t } = useStore();
  const { route } = useRouter();
  return (
    <nav className="subnav" aria-label={t('nav.backstage')}>
      <Link to={{ page: 'backstage' }} className={route.page === 'backstage' ? 'active' : ''}>{t('bs.orders')}</Link>
      <Link to={{ page: 'clients' }} className={route.page === 'clients' ? 'active' : ''}>{t('bs.clients')}</Link>
      <Link to={{ page: 'settings' }} className={route.page === 'settings' ? 'active' : ''}>{t('bs.settings')}</Link>
    </nav>
  );
}

function NotSeller() {
  const { t } = useStore();
  return <Empty>{t('bs.notSeller')} <Link to={{ page: 'beta' }}>{t('nav.betaTools')}</Link></Empty>;
}

export function BackstagePage() {
  const { t, db, mySeller, me, run, lang, now } = useStore();
  if (!mySeller || !me) return <NotSeller />;
  const s = mySeller;
  const mine = db.orders.filter((o) => o.sellerId === s.id);
  const queue = sellerQueue(db, s.id);
  const byStatus = (...st: string[]) => queue.filter((o) => st.includes(o.status));
  const delivered = mine.filter((o) => o.status === 'delivered');
  const closed = mine.filter((o) => ['completed', 'cancelled', 'declined'].includes(o.status))
    .sort((a, b) => (b.history.at(-1)?.at ?? '').localeCompare(a.history.at(-1)?.at ?? '')).slice(0, 6);
  const inWork = byStatus('processing', 'fulfilling').length;
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const doneThisWeek = mine.filter((o) => o.deliveredAt && o.deliveredAt >= weekAgo).length;
  const st = sellerStats(db, s.id);

  const section = (title: string, hint: string, list: typeof queue) => (
    <div className="stack-sm">
      <h2>{title} <span className="muted num">{list.length}</span></h2>
      {list.length ? <div className="order-list">{list.map((o) => <OrderRow key={o.id} o={o} perspective="seller" />)}</div>
        : <p className="muted small">{hint}</p>}
    </div>
  );

  return (
    <section className="stack">
      <div className="page-head row-between">
        <h1>{t('nav.backstage')}</h1>
        <SubNav />
      </div>
      <dl className="stats strip">
        <div><dt>{t('bs.inWork')}</dt><dd className={`num ${inWork > s.maxConcurrent ? 'over' : ''}`}>{inWork} / {s.maxConcurrent}</dd></div>
        <div><dt>{t('bs.thisWeek')}</dt><dd className="num">{doneThisWeek} / {s.weeklyCapacity}</dd></div>
        <div><dt>{t('bs.wait')}</dt><dd className="num">~{publicWaitDays(db, s)} {t('bs.days')}</dd></div>
        <div><dt>{t('bs.level')}</dt><dd>{t(`level.seller.${s.levelState.level}`)} <span className="muted small num">{st.points}</span></dd></div>
      </dl>
      {s.levelState.graceUntil && <p className="notice warn">{t('bs.grace', { date: fmtDate(s.levelState.graceUntil, lang, false) })}</p>}
      <div className="toggles">
        <label className="switch"><input type="checkbox" id="vacation" checked={s.vacation.on} onChange={(e) => run(setVacation(s.id, me.id, e.target.checked))} /><span>{t('bs.vacation')}</span></label>
        <label className="switch"><input type="checkbox" id="accepting" checked={s.accepting} onChange={(e) => run(updateSeller(s.id, me.id, { accepting: e.target.checked }))} /><span>{t('bs.accepting')}</span></label>
      </div>
      {section(t('bs.needsReply'), t('bs.needsReplyNone'), byStatus('received'))}
      {section(t('bs.ready'), t('bs.readyNone'), byStatus('cleared'))}
      {section(t('bs.working'), t('bs.workingNone'), byStatus('processing', 'fulfilling'))}
      {section(t('bs.waitingClient'), t('bs.waitingClientNone'), delivered)}
      {closed.length > 0 && section(t('bs.closed'), '', closed)}
    </section>
  );
}

const TOKEN_TYPES: TokenType[] = ['priority', 'rush', 'high_effort', 'extra_slot'];

export function ClientsPage() {
  const { t, db, mySeller, me, run, lang, now } = useStore();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [tokenType, setTokenType] = useState<Record<string, TokenType>>({});
  const [err, setErr] = useState<string | null>(null);
  if (!mySeller || !me) return <NotSeller />;
  const s = mySeller;
  const clientIds = [...new Set(db.orders.filter((o) => o.sellerId === s.id).map((o) => o.clientId))];
  const clients = clientIds.map((id) => db.accounts.find((a) => a.id === id)).filter(Boolean);

  return (
    <section className="stack">
      <div className="page-head row-between">
        <h1>{t('bs.clients')}</h1>
        <SubNav />
      </div>
      <p className="muted small">{t('bs.clientsLead')}</p>
      <ErrorLine msg={err} />
      {clients.length === 0 && <Empty>{t('bs.noClients')}</Empty>}
      <div className="client-list">
        {clients.map((c) => {
          const cs = clientStats(db, c!.id);
          const bl = activeBlacklist(db, s.id, c!.id, now);
          const open = db.orders.filter((o) => o.clientId === c!.id && o.sellerId === s.id && !['completed', 'cancelled', 'declined'].includes(o.status)).length;
          return (
            <div key={c!.id} className="card client">
              <div className="client-head">
                <span className="mc client-name">{c!.mcName}</span>
                <span className="level-pill">{t(`level.client.${cs.level}`)}</span>
                {bl && <span className="chip chip-cancelled">{bl.clearedAt ? t('bs.penaltyUntil', { date: fmtDate(bl.penaltyUntil, lang, false) }) : t('bs.blacklisted')}</span>}
              </div>
              <div className="client-stats small">
                <span>{t('stats.points')}: <span className="num">{cs.points}</span></span>
                <span>{t('stats.completed')}: <span className="num">{cs.completed}</span></span>
                <span>{t('bs.openOrders')}: <span className="num">{open}</span></span>
                <span>{t('bs.maxTier')}: T{cs.maxFarmTier}</span>
                <span>{t('bs.tokensLeft')}: <span className="num">{unusedTokens(db, c!.id).length}</span></span>
              </div>
              {bl && !bl.clearedAt && <p className="small muted">{t('bs.reason')}: {bl.reason}</p>}
              <div className="client-actions">
                {bl && !bl.clearedAt ? (
                  <button type="button" className="btn small" onClick={() => setErr(run(clearBlacklist(s.id, me.id, c!.id)))}>{t('bs.clearBlacklist', { n: s.blacklistPenaltyDays })}</button>
                ) : !bl && (
                  <div className="inline-form">
                    <input id={`bl-${c!.id}`} aria-label={t('bs.reason')} placeholder={t('bs.reasonPh')} value={reason[c!.id] ?? ''} onChange={(e) => setReason({ ...reason, [c!.id]: e.target.value })} />
                    <button type="button" className="btn small danger" onClick={() => setErr(run(blacklistClient(s.id, me.id, c!.id, reason[c!.id] ?? '')))}>{t('bs.blacklist')}</button>
                  </div>
                )}
                <div className="inline-form">
                  <select id={`tk-${c!.id}`} aria-label={t('bs.tokenType')} value={tokenType[c!.id] ?? 'priority'} onChange={(e) => setTokenType({ ...tokenType, [c!.id]: e.target.value as TokenType })}>
                    {TOKEN_TYPES.map((x) => <option key={x} value={x}>{t(`token.${x}`)}</option>)}
                  </select>
                  <button type="button" className="btn small" onClick={() => setErr(run(grantToken(me.id, c!.id, tokenType[c!.id] ?? 'priority')))}>{t('bs.grant')}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { t, db, mySeller, me, run, lang, showToast } = useStore();
  const [form, setForm] = useState(() => mySeller ? {
    displayName: mySeller.displayName, de: mySeller.tagline.de, en: mySeller.tagline.en,
    weeklyCapacity: mySeller.weeklyCapacity, maxConcurrent: mySeller.maxConcurrent, blacklistPenaltyDays: mySeller.blacklistPenaltyDays,
  } : null);
  const [err, setErr] = useState<string | null>(null);
  if (!mySeller || !me || !form) return <NotSeller />;
  const s = mySeller;
  const services = db.services.filter((x) => x.sellerId === s.id);
  const st = sellerStats(db, s.id);

  return (
    <section className="stack">
      <div className="page-head row-between">
        <h1>{t('bs.settings')}</h1>
        <SubNav />
      </div>
      <form className="card form" onSubmit={(e) => {
        e.preventDefault();
        const r = run(updateSeller(s.id, me.id, {
          displayName: form.displayName.trim() || s.displayName, tagline: { de: form.de, en: form.en },
          weeklyCapacity: Math.max(1, form.weeklyCapacity), maxConcurrent: Math.max(1, form.maxConcurrent), blacklistPenaltyDays: Math.max(0, form.blacklistPenaltyDays),
        }));
        setErr(r); if (!r) showToast(t('common.saved'));
      }}>
        <h2>{t('set.profile')}</h2>
        <Field label={t('set.name')} htmlFor="s-name" hint={t('set.nameHint')}><input id="s-name" value={form.displayName} maxLength={16} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label={t('set.taglineDe')} htmlFor="s-de"><input id="s-de" value={form.de} maxLength={120} onChange={(e) => setForm({ ...form, de: e.target.value })} /></Field>
        <Field label={t('set.taglineEn')} htmlFor="s-en"><input id="s-en" value={form.en} maxLength={120} onChange={(e) => setForm({ ...form, en: e.target.value })} /></Field>
        <div className="grid-3">
          <Field label={t('set.weekly')} htmlFor="s-week" hint={t('set.weeklyHint')}><input id="s-week" type="number" min={1} value={form.weeklyCapacity} onChange={(e) => setForm({ ...form, weeklyCapacity: Number(e.target.value) })} /></Field>
          <Field label={t('set.concurrent')} htmlFor="s-conc"><input id="s-conc" type="number" min={1} value={form.maxConcurrent} onChange={(e) => setForm({ ...form, maxConcurrent: Number(e.target.value) })} /></Field>
          <Field label={t('set.penalty')} htmlFor="s-pen"><input id="s-pen" type="number" min={0} value={form.blacklistPenaltyDays} onChange={(e) => setForm({ ...form, blacklistPenaltyDays: Number(e.target.value) })} /></Field>
        </div>
        <ErrorLine msg={err} />
        <div className="actions"><button type="submit" className="btn primary">{t('common.save')}</button></div>
      </form>

      <div className="card stack-sm">
        <h2>{t('set.catalog')}</h2>
        <p className="muted small">{t('set.catalogHint')}</p>
        {services.map((svc) => (
          <label key={svc.id} className="switch">
            <input type="checkbox" id={`svc-${svc.id}`} checked={svc.active} onChange={() => run(toggleService(svc.id, me.id))} />
            <span>{svc.name[lang]} <span className="muted small">· {t(`kind.${svc.kind}`)}</span></span>
          </label>
        ))}
      </div>

      <div className="card stack-sm">
        <h2>{t('set.reputation')}</h2>
        <p className="muted small">{t('set.reputationHint')}</p>
        <div className="kv"><span>{t('stats.points')}</span><span className="num">{st.points}</span></div>
        <div className="kv"><span>{t('stats.rating')}</span><span><Stars value={st.avgStars} size="sm" /> {st.avgStars?.toFixed(2) ?? '—'}</span></div>
        <div className="kv"><span>{t('set.uniqueClients')}</span><span className="num">{st.uniqueClients}</span></div>
        <div className="kv"><span>{t('set.earned')}</span><span>{t(`level.seller.${st.earnedLevel}`)}</span></div>
      </div>
    </section>
  );
}

export function BetaPage() {
  const { t, db, me, setSession, run, replace, showToast, lang } = useStore();
  const { go } = useRouter();
  const [json, setJson] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const exported = JSON.stringify(db);

  const importJson = () => {
    try {
      const parsed = JSON.parse(json) as DB;
      if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.accounts)) throw new Error('shape');
      replace(parsed); setJson(''); setErr(null); showToast(t('beta.imported'));
    } catch { setErr(t('beta.importBad')); }
  };

  return (
    <section className="stack">
      <div className="page-head">
        <h1>{t('nav.betaTools')}</h1>
        <p className="lead">{t('beta.lead')}</p>
      </div>
      <div className="card stack-sm">
        <h2>{t('beta.actAs')}</h2>
        <p className="muted small">{t('beta.actAsHint')}</p>
        <div className="row wrap-row">
          {db.accounts.map((a) => (
            <button key={a.id} type="button" className={`btn small ${me?.id === a.id ? 'primary' : ''}`}
              onClick={() => { setSession(a.id); go(a.sellerId ? { page: 'backstage' } : { page: 'orders' }); }}>
              <span className="mc">{a.mcName}</span>{a.sellerId ? ` · ${t('beta.seller')}` : ''}
            </button>
          ))}
          <Link to={{ page: 'signin' }} className="btn small ghost">{t('beta.newClient')}</Link>
        </div>
      </div>
      <div className="card stack-sm">
        <h2>{t('beta.clock')}</h2>
        <p className="muted small">{t('beta.clockHint', { date: fmtDate(new Date(Date.now() + db.clockOffsetDays * DAY).toISOString(), lang), n: db.clockOffsetDays })}</p>
        <div className="row wrap-row">
          <button type="button" className="btn small" onClick={() => run(advanceClock(1))}>+1 {t('bs.days')}</button>
          <button type="button" className="btn small" onClick={() => run(advanceClock(3))}>+3 {t('bs.days')}</button>
          <button type="button" className="btn small" onClick={() => run(advanceClock(31))}>+31 {t('bs.days')}</button>
          {db.clockOffsetDays !== 0 && <button type="button" className="btn small ghost" onClick={() => run(advanceClock(-db.clockOffsetDays))}>{t('beta.clockReset')}</button>}
        </div>
      </div>
      <div className="card stack-sm">
        <h2>{t('beta.data')}</h2>
        <p className="muted small">{t('beta.dataHint', { orders: db.orders.length, accounts: db.accounts.length })}</p>
        <div className="row wrap-row">
          <button type="button" className="btn small" onClick={() => { replace(resetTo('examples')()); setSession(null); showToast(t('beta.resetDone')); }}>{t('beta.resetExamples')}</button>
          <button type="button" className="btn small" onClick={() => { replace(resetTo('empty')()); setSession(null); showToast(t('beta.resetDone')); }}>{t('beta.resetEmpty')}</button>
          <button type="button" className="btn small" onClick={() => {
            navigator.clipboard?.writeText(exported).then(() => showToast(t('beta.copied')), () => setJson(exported));
          }}>{t('beta.copyJson')}</button>
        </div>
        <Field label={t('beta.importLabel')} htmlFor="b-json" hint={t('beta.importHint')}>
          <textarea id="b-json" rows={3} className="mono" value={json} onChange={(e) => setJson(e.target.value)} />
        </Field>
        <ErrorLine msg={err} />
        <div className="actions"><button type="button" className="btn small" disabled={!json.trim()} onClick={importJson}>{t('beta.import')}</button></div>
      </div>
    </section>
  );
}
