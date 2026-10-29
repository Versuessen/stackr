import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { AccountName, ConfirmButton, Empty, ErrorLine, Field, PageHead, Stars, StatusChip, TokenPill, fmtDate, fmtN, relDays } from '../ui/components';
import { useShopStatus } from '../ui/Layout';
import { orderName, orderSummary } from './Orders';
import { resetTo } from '../data/actions';
import { ApiError, apiGet, apiPost } from '../data/api';
import { DAY, activeBlacklist, clientStats, publicWaitDays, sellerQueue, sellerStats, tokensOf, unusedTokens } from '../domain/rules';
import type { DB, TokenType } from '../domain/types';

function SubNav() {
  const { t } = useStore();
  const { route } = useRouter();
  return (
    <nav className="seg" aria-label={t('nav.backstage')}>
      {(['backstage', 'clients', 'settings'] as const).map((p) => (
        <Link key={p} to={{ page: p }} className="seg-link" aria-current={route.page === p ? 'page' : undefined}>{t(`bs.tab.${p}`)}</Link>
      ))}
    </nav>
  );
}

function NotSeller() {
  const { t, mode, me, live } = useStore();
  const action = mode === 'beta'
    ? <Link to={{ page: 'beta' }} className="btn btn-secondary">{t('nav.betaTools')}</Link>
    : !me || live?.mfa ? <Link to={{ page: 'signin' }} className="btn btn-primary">{live?.mfa ? t('mfa.title') : t('nav.signIn')}</Link> : undefined;
  return <div className="wrap shop"><Empty title={t('bs.notSeller')} action={action} /></div>;
}

function Switch({ id, on, onChange, title, body }: { id: string; on: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
  const { t } = useStore();
  return (
    <button id={id} className="switch" type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span><span className="t-body" style={{ fontWeight: 600, display: 'block' }}>{title}</span><span className="t-small mute">{body}</span></span>
      <span className="switch-ui"><span className="switch-state">{on ? t('common.on') : t('common.off')}</span><span className="switch-track" aria-hidden="true" /></span>
    </button>
  );
}

type Filter = 'all' | 'reply' | 'ready' | 'work' | 'review' | 'closed';
const FILTERS: Record<Filter, string[]> = {
  all: ['received', 'cleared', 'processing', 'fulfilling', 'delivered'], reply: ['received'], ready: ['cleared'],
  work: ['processing', 'fulfilling'], review: ['delivered'], closed: ['completed', 'cancelled', 'declined'],
};

export function BackstagePage() {
  const { t, db, mySeller, me, run, lang, now } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const status = useShopStatus();
  if (!mySeller || !me) return <NotSeller />;
  const s = mySeller;
  const mine = db.orders.filter((o) => o.sellerId === s.id);
  const queue = sellerQueue(db, s.id);
  const rows = (filter === 'closed' ? mine.filter((o) => FILTERS.closed.includes(o.status)).sort((a, b) => (b.history.at(-1)?.at ?? '').localeCompare(a.history.at(-1)?.at ?? ''))
    : [...queue, ...mine.filter((o) => o.status === 'delivered')].filter((o) => FILTERS[filter].includes(o.status)));
  const count = (f: Filter) => (f === 'closed' ? mine.filter((o) => FILTERS.closed.includes(o.status)).length : [...queue, ...mine.filter((o) => o.status === 'delivered')].filter((o) => FILTERS[f].includes(o.status)).length);
  const inWork = queue.filter((o) => ['processing', 'fulfilling'].includes(o.status)).length;
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const doneThisWeek = mine.filter((o) => o.deliveredAt && o.deliveredAt >= weekAgo).length;
  const st = sellerStats(db, s.id);
  const reply = mine.filter((o) => o.status === 'received');

  return (
    <div className="wrap back">
      <PageHead title={t('nav.backstage')} lead={t('bs.lead')} aside={<SubNav />} />
      <dl className="stats">
        <div className="card"><dt className="t-label mute">{t('bs.needsReply')}</dt><dd className="d-l num">{reply.length}</dd><dd className="t-small mute">{reply.length ? t('bs.oldest', { rel: relDays(reply[0].createdAt, now, t) }) : t('bs.nothingWaiting')}</dd></div>
        <div className={`card ${inWork > s.maxConcurrent ? 'over' : ''}`}><dt className="t-label mute">{t('bs.inWork')}</dt><dd className="d-l num">{inWork}<span className="unit"> / {s.maxConcurrent}</span></dd><dd className="t-small mute">{t('bs.thisWeekN', { n: doneThisWeek, max: s.weeklyCapacity })}</dd></div>
        <div className="card"><dt className="t-label mute">{t('bs.wait')}</dt><dd className="d-l num">~{publicWaitDays(db, s)}<span className="unit"> {t('common.days')}</span></dd><dd className="t-small mute">{t('bs.waitNote')}</dd></div>
        <div className="card"><dt className="t-label mute">{t('bs.level')}</dt><dd className="d-l num">{fmtN(st.points, lang)}</dd><dd className="t-small mute">{t(`level.seller.${s.levelState.level}`)}</dd></div>
      </dl>
      {s.levelState.graceUntil && <p className="notice warn" style={{ marginTop: 16 }}>{t('bs.grace', { date: fmtDate(s.levelState.graceUntil, lang, false) })}</p>}
      <div className="b-grid">
        <section className="card" aria-labelledby="h-orders">
          <div className="card-head">
            <h2 className="t-title" id="h-orders">{t('bs.orders')}</h2>
            <div className="seg scroll-seg" role="radiogroup" aria-label={t('bs.filter')}>
              {(Object.keys(FILTERS) as Filter[]).map((f) => <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>{t(`bs.f.${f}`)} {count(f)}</button>)}
            </div>
          </div>
          {rows.length ? (
            <table className="otable">
              <thead><tr><th scope="col">{t('bs.col.order')}</th><th scope="col">{t('bs.col.client')}</th><th scope="col">{t('bs.col.status')}</th><th scope="col">{t('bs.col.token')}</th><th scope="col">{t('bs.col.due')}</th><th scope="col"><span className="sr">{t('bs.col.open')}</span></th></tr></thead>
              <tbody>
                {rows.map((o) => {
                  const tokens = tokensOf(o, db);
                  return (
                    <tr key={o.id}>
                      <td data-l={t('bs.col.order')}><b className="num">#{o.number}</b><span className="t-small ink2 cell-sub">{orderName(o, lang)} · {orderSummary(o, t)}</span></td>
                      <td data-l={t('bs.col.client')}><AccountName account={db.accounts.find((a) => a.id === o.clientId)} /></td>
                      <td data-l={t('bs.col.status')}><StatusChip status={o.status} perspective="seller" /></td>
                      <td data-l={t('bs.col.token')}>{tokens.length ? tokens.map((tok) => <TokenPill key={tok.id} token={tok} />) : '—'}</td>
                      <td data-l={t('bs.col.due')} className="num">{o.dueAt ? fmtDate(o.dueAt, lang, false) : '—'}</td>
                      <td className="go"><Link to={{ page: 'order', id: o.id }} className="btn btn-secondary btn-sm" aria-label={t('bs.openN', { n: o.number })}>{t('bs.col.open')}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="t-body ink2" style={{ padding: 20, margin: 0 }}>{t('bs.emptyFilter')}</p>}
        </section>
        <section className="card settings" aria-labelledby="h-set">
          <h2 className="t-title" id="h-set">{t('bs.shop')}</h2>
          <Switch id="accepting" on={s.accepting} onChange={(v) => { void run({ type: 'updateSeller', patch: { accepting: v } }); }} title={t('bs.accepting')} body={t('bs.acceptingBody')} />
          <Switch id="vacation" on={s.vacation.on} onChange={(v) => { void run({ type: 'setVacation', on: v }); }} title={t('bs.vacation')} body={t('bs.vacationBody')} />
          <div className="preview-note"><span className="t-label mute">{t('bs.clientsSee')}</span><span className={`status ${status.away ? 'away' : ''}`}><i aria-hidden="true" />{status.text}</span></div>
        </section>
      </div>
    </div>
  );
}

const TOKEN_TYPES: TokenType[] = ['priority', 'rush', 'high_effort', 'extra_slot'];

/** A one-time code shown once, with what to type in-game. */
function CodeBox({ code, name, kind, expiresAt, onClose }: { code: string; name: string; kind: 'invite' | 'reset'; expiresAt: string; onClose: () => void }) {
  const { t, lang, showToast } = useStore();
  const msg = `/msg ${name} ${t(kind === 'invite' ? 'inv.msgInvite' : 'inv.msgReset', { code })}`;
  const copy = () => void navigator.clipboard?.writeText(msg).then(() => showToast(t('auth.copied')), () => {});
  return (
    <div className="code-box" role="status">
      <p className="t-label mute">{t(kind === 'invite' ? 'inv.codeFor' : 'inv.resetFor', { name })}</p>
      <p className="d-s num mono code-big">{code}</p>
      <p className="t-small ink2">{t('inv.giveInGame', { date: fmtDate(expiresAt, lang) })}</p>
      <p className="mono t-small msg-line">{msg}</p>
      <div className="row-gap">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{t('inv.copyMsg')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('common.close')}</button>
      </div>
    </div>
  );
}

type Invite = { id: string; name: string; createdAt: string; expiresAt: string };

function InvitesCard() {
  const { t, lang, mySeller, run, refresh } = useStore();
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ code: string; name: string; expiresAt: string; takesOver: boolean } | null>(null);
  const [list, setList] = useState<Invite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(() => { apiGet<{ invites: Invite[] }>('seller/invites').then((r) => setList(r.data?.invites ?? []), () => {}); }, []);
  React.useEffect(load, [load]);
  if (!mySeller) return null;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name.trim())) { setErr(t('err.badName')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await apiPost<{ code: string; name: string; expiresAt: string; takesOver: boolean }>('seller/invite', { name: name.trim() });
      setMade(r); setName(''); load();
    } catch (e2) { setErr(e2 instanceof ApiError ? t(e2.key, e2.vars) : t('err.unknown')); } finally { setBusy(false); }
  };
  return (
    <section className="card form-card invites" aria-labelledby="h-inv">
      <h2 className="t-title" id="h-inv">{t('inv.title')}</h2>
      <p className="t-small ink2">{t('inv.lead')}</p>
      <form className="inline-form" onSubmit={create} noValidate>
        <label className="sr" htmlFor="inv-name">{t('auth.name')}</label>
        <input className="field mc" id="inv-name" placeholder={t('auth.name')} value={name} maxLength={16} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{t('inv.create')}</button>
      </form>
      <ErrorLine msg={err} />
      {made && <>
        {made.takesOver && <p className="notice warn">{t('inv.takesOver', { name: made.name })}</p>}
        <CodeBox code={made.code} name={made.name} kind="invite" expiresAt={made.expiresAt} onClose={() => setMade(null)} />
      </>}
      {list.length > 0 && (
        <ul className="plain inv-list">
          {list.map((i) => (
            <li key={i.id}><span className="mc">{i.name}</span><span className="t-small mute">{t('inv.until', { date: fmtDate(i.expiresAt, lang, false) })}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await apiPost('seller/invite/revoke', { id: i.id }).catch(() => {}); load(); }}>{t('inv.revoke')}</button></li>
          ))}
        </ul>
      )}
      <Switch id="invite-only" on={!!mySeller.inviteOnly} onChange={async (v) => { await run({ type: 'updateSeller', patch: { inviteOnly: v } }); void refresh(); }}
        title={t('inv.only')} body={t('inv.onlyBody')} />
    </section>
  );
}

export function ClientsPage() {
  const { t, db, mySeller, me, run, lang, now, showToast, mode, refresh } = useStore();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [tokenType, setTokenType] = useState<Record<string, TokenType>>({});
  const [err, setErr] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<{ accountId: string; code: string; name: string; expiresAt: string } | null>(null);
  if (!mySeller || !me) return <NotSeller />;
  const s = mySeller;
  const live = mode === 'live';
  // Live: every registered player (to confirm names before a first order). Beta: players with orders.
  const clients = (live
    ? db.accounts.filter((a) => !a.sellerId && !a.deletedAt)
    : [...new Set(db.orders.filter((o) => o.sellerId === s.id).map((o) => o.clientId))].map((id) => db.accounts.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a))
    .sort((a, b) => Number(!!a.disabledAt) - Number(!!b.disabledAt) || Number(!!a.nameConfirmedAt) - Number(!!b.nameConfirmedAt) || b.createdAt.localeCompare(a.createdAt));
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? t(e.key, e.vars) : t('err.unknown')); } };

  return (
    <div className="wrap back">
      <PageHead title={t('bs.clients')} lead={t('bs.clientsLead')} aside={<SubNav />} />
      {live && <InvitesCard />}
      <ErrorLine msg={err} />
      {clients.length === 0 && <Empty title={t('bs.noClients')} />}
      <ul className="clients plain" style={{ marginTop: 24 }}>
        {clients.map((c) => {
          const cs = clientStats(db, c.id);
          const bl = activeBlacklist(db, s.id, c.id, now);
          const open = db.orders.filter((o) => o.clientId === c.id && o.sellerId === s.id && !['completed', 'cancelled', 'declined'].includes(o.status)).length;
          return (
            <li key={c.id} className={`client card ${bl && !bl.clearedAt ? 'off' : ''}`}>
              <div className="client-top"><span className="avatar a2" aria-hidden="true">{c.mcName.slice(0, 2).toUpperCase()}</span><div><b><AccountName account={c} /></b> <span className={`badge ${cs.level === 'new' ? 'b-line' : 'b-info'}`}>{t(`level.client.${cs.level}`)}</span>
                {live && c.nameConfirmedAt && <span className="badge b-ok">{t('name.confirmed')}</span>}</div></div>
              {live && !c.disabledAt && (
                <div className="row-gap name-actions">
                  {!c.nameConfirmedAt && <button type="button" className="btn btn-primary btn-sm" onClick={async () => { const r = await run({ type: 'confirmName', clientId: c.id }); setErr(r); if (!r) showToast(t('name.confirmedToast', { name: c.mcName })); }}>{t('name.confirm')}</button>}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(async () => { const r = await apiPost<{ code: string; name: string; expiresAt: string }>('seller/reset-code', { accountId: c.id }); setResetCode({ accountId: c.id, ...r }); })}>{t('name.resetCode')}</button>
                  {!c.nameConfirmedAt && <ConfirmButton id={`rel-${c.id}`} className="btn btn-ghost btn-sm danger" label={t('name.release')} confirmBody={t('name.releaseBody', { name: c.mcName })} confirmLabel={t('name.release')}
                    onConfirm={() => void act(async () => { await apiPost('seller/release', { accountId: c.id }); await refresh(); showToast(t('name.releasedToast', { name: c.mcName })); })} />}
                </div>
              )}
              {resetCode?.accountId === c.id && <CodeBox code={resetCode.code} name={resetCode.name} kind="reset" expiresAt={resetCode.expiresAt} onClose={() => setResetCode(null)} />}
              <dl className="client-kv">
                <div><dt>{t('stats.points')}</dt><dd className="num">{cs.points}</dd></div>
                <div><dt>{t('stats.completed')}</dt><dd className="num">{cs.completed}</dd></div>
                <div><dt>{t('bs.openOrders')}</dt><dd className="num">{open}</dd></div>
                <div><dt>{t('bs.maxTier')}</dt><dd>{t('farm.tierN', { n: cs.maxFarmTier })}</dd></div>
                <div><dt>{t('bs.tokensLeft')}</dt><dd className="num">{unusedTokens(db, c.id).length}</dd></div>
              </dl>
              {bl && <p className="err" style={{ margin: 0 }}>{bl.clearedAt ? t('bs.penaltyUntil', { date: fmtDate(bl.penaltyUntil, lang, false) }) : `${t('bs.blacklisted')} · ${bl.reason}`}</p>}
              <div className="inline-form">
                <label className="sr" htmlFor={`tk-${c.id}`}>{t('bs.tokenType')}</label>
                <select className="field" id={`tk-${c.id}`} value={tokenType[c.id] ?? 'priority'} onChange={(e) => setTokenType({ ...tokenType, [c.id]: e.target.value as TokenType })}>
                  {TOKEN_TYPES.map((x) => <option key={x} value={x}>{t(`token.${x}`)}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { const r = await run({ type: 'grantToken', clientId: c.id, tokenType: tokenType[c.id] ?? 'priority' }); setErr(r); if (!r) showToast(<><b>{t(`token.${tokenType[c.id] ?? 'priority'}`)}</b> {t('bs.granted', { name: c.mcName })}</>); }}>{t('bs.grant')}</button>
              </div>
              {bl && !bl.clearedAt ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => setErr(await run({ type: 'clearBlacklist', clientId: c.id }))}>{t('bs.clearBlacklist', { n: s.blacklistPenaltyDays })}</button>
              ) : !bl && (
                <div className="inline-form">
                  <label className="sr" htmlFor={`bl-${c.id}`}>{t('bs.reason')}</label>
                  <input className="field" id={`bl-${c.id}`} placeholder={t('bs.reasonPh')} value={reason[c.id] ?? ''} onChange={(e) => setReason({ ...reason, [c.id]: e.target.value })} />
                  <ConfirmButton id={`blk-${c.id}`} className="btn btn-ghost btn-sm danger" label={t('bs.blacklist')} confirmBody={t('bs.blacklistBody', { name: c.mcName })} confirmLabel={t('bs.blacklist')} onConfirm={async () => setErr(await run({ type: 'blacklistClient', clientId: c.id, reason: reason[c.id] ?? '' }))} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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
    <div className="wrap back stack">
      <PageHead title={t('bs.settings')} aside={<SubNav />} />
      <form className="card form-card" onSubmit={async (e) => {
        e.preventDefault();
        const r = await run({ type: 'updateSeller', patch: {
          displayName: form.displayName.trim() || s.displayName, tagline: { de: form.de, en: form.en },
          weeklyCapacity: Math.max(1, form.weeklyCapacity), maxConcurrent: Math.max(1, form.maxConcurrent), blacklistPenaltyDays: Math.max(0, form.blacklistPenaltyDays),
        } });
        setErr(r); if (!r) showToast(t('common.saved'));
      }}>
        <h2 className="t-title">{t('set.profile')}</h2>
        <Field label={t('set.name')} htmlFor="s-name" hint={t('set.nameHint')}><input className="field" id="s-name" value={form.displayName} maxLength={16} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label={t('set.taglineDe')} htmlFor="s-de"><input className="field" id="s-de" value={form.de} maxLength={120} onChange={(e) => setForm({ ...form, de: e.target.value })} /></Field>
        <Field label={t('set.taglineEn')} htmlFor="s-en"><input className="field" id="s-en" value={form.en} maxLength={120} onChange={(e) => setForm({ ...form, en: e.target.value })} /></Field>
        <div className="grid-3">
          <Field label={t('set.weekly')} htmlFor="s-week" hint={t('set.weeklyHint')}><input className="field" id="s-week" type="number" min={1} value={form.weeklyCapacity} onChange={(e) => setForm({ ...form, weeklyCapacity: Number(e.target.value) })} /></Field>
          <Field label={t('set.concurrent')} htmlFor="s-conc"><input className="field" id="s-conc" type="number" min={1} value={form.maxConcurrent} onChange={(e) => setForm({ ...form, maxConcurrent: Number(e.target.value) })} /></Field>
          <Field label={t('set.penalty')} htmlFor="s-pen"><input className="field" id="s-pen" type="number" min={0} value={form.blacklistPenaltyDays} onChange={(e) => setForm({ ...form, blacklistPenaltyDays: Number(e.target.value) })} /></Field>
        </div>
        <ErrorLine msg={err} />
        <div className="row-gap"><button type="submit" className="btn btn-primary">{t('common.save')}</button></div>
      </form>

      <section className="card form-card" aria-labelledby="h-cat">
        <h2 className="t-title" id="h-cat">{t('set.catalog')}</h2>
        <p className="t-small ink2">{t('set.catalogHint')}</p>
        {services.map((svc) => (
          <button key={svc.id} id={`svc-${svc.id}`} className="switch" type="button" role="switch" aria-checked={svc.active} onClick={() => { void run({ type: 'toggleService', serviceId: svc.id }); }}>
            <span>{svc.name[lang]} <span className="t-small mute">· {t(`kind.${svc.kind}`)}</span></span>
            <span className="switch-ui"><span className="switch-state">{svc.active ? t('common.on') : t('common.off')}</span><span className="switch-track" aria-hidden="true" /></span>
          </button>
        ))}
      </section>

      <section className="card form-card" aria-labelledby="h-rep">
        <h2 className="t-title" id="h-rep">{t('set.reputation')}</h2>
        <p className="t-small ink2">{t('set.reputationHint')}</p>
        <dl className="kv">
          <div><dt>{t('stats.points')}</dt><dd className="num">{st.points}</dd></div>
          <div><dt>{t('stats.rating')}</dt><dd><Stars value={st.avgStars} /> {st.avgStars?.toFixed(2) ?? '—'}</dd></div>
          <div><dt>{t('set.uniqueClients')}</dt><dd className="num">{st.uniqueClients}</dd></div>
          <div><dt>{t('set.earned')}</dt><dd>{t(`level.seller.${st.earnedLevel}`)}</dd></div>
        </dl>
      </section>
    </div>
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
    <div className="wrap back stack">
      <PageHead title={t('nav.betaTools')} lead={t('beta.lead')} />
      <div className="card form-card">
        <h2 className="t-title">{t('beta.actAs')}</h2>
        <p className="t-small ink2">{t('beta.actAsHint')}</p>
        <div className="row-gap">
          {db.accounts.map((a) => (
            <button key={a.id} type="button" className={`btn btn-sm ${me?.id === a.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setSession(a.id); go(a.sellerId ? { page: 'backstage' } : { page: 'orders' }); }}>
              <span className="mc">{a.mcName}</span>{a.sellerId ? ` · ${t('beta.seller')}` : ''}
            </button>
          ))}
          <Link to={{ page: 'signin' }} className="btn btn-ghost btn-sm">{t('beta.newClient')}</Link>
        </div>
      </div>
      <div className="card form-card">
        <h2 className="t-title">{t('beta.clock')}</h2>
        <p className="t-small ink2">{t('beta.clockHint', { date: fmtDate(new Date(Date.now() + db.clockOffsetDays * DAY).toISOString(), lang), n: db.clockOffsetDays })}</p>
        <div className="row-gap">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void run({ type: 'advanceClock', days: 1 }); }}>+1 {t('bs.days')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void run({ type: 'advanceClock', days: 3 }); }}>+3 {t('bs.days')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void run({ type: 'advanceClock', days: 31 }); }}>+31 {t('bs.days')}</button>
          {db.clockOffsetDays !== 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void run({ type: 'advanceClock', days: -db.clockOffsetDays }); }}>{t('beta.clockReset')}</button>}
        </div>
      </div>
      <div className="card form-card">
        <h2 className="t-title">{t('beta.data')}</h2>
        <p className="t-small ink2">{t('beta.dataHint', { orders: db.orders.length, accounts: db.accounts.length })}</p>
        <div className="row-gap">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { replace(resetTo('examples')()); setSession(null); showToast(t('beta.resetDone')); }}>{t('beta.resetExamples')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { replace(resetTo('empty')()); setSession(null); showToast(t('beta.resetDone')); }}>{t('beta.resetEmpty')}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            navigator.clipboard?.writeText(exported).then(() => showToast(t('beta.copied')), () => setJson(exported));
          }}>{t('beta.copyJson')}</button>
        </div>
        <Field label={t('beta.importLabel')} htmlFor="b-json" hint={t('beta.importHint')}>
          <textarea id="b-json" rows={3} className="field mono" value={json} onChange={(e) => setJson(e.target.value)} />
        </Field>
        <ErrorLine msg={err} />
        <div className="row-gap"><button type="button" className="btn btn-secondary btn-sm" disabled={!json.trim()} onClick={importJson}>{t('beta.import')}</button></div>
      </div>
    </div>
  );
}
