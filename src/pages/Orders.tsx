import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link } from '../ui/router';
import {
  AccountName, ConfirmButton, Coords, Empty, ErrorLine, Field, StarInput, Stars, StatusChip, StatusTimeline, TokenPill, fmtDate, relDays,
} from '../ui/components';
import {
  acceptTerms, approve, cancelByClient, cancelBySeller, clearOrder, complain, declineOrder, deliverBatch, proposeTerms, rate,
  sendMessage, startFulfilling, startProcessing,
} from '../data/actions';
import { CONFIG, DAY, estimateWaitDays, isOpen, queuePosition, sellerQueue, tokensOf } from '../domain/rules';
import type { Order, RatingTags } from '../domain/types';

export function OrderRow({ o, perspective }: { o: Order; perspective: 'client' | 'seller' }) {
  const { t, db, lang } = useStore();
  const other = perspective === 'client'
    ? db.sellers.find((s) => s.id === o.sellerId)?.displayName
    : db.accounts.find((a) => a.id === o.clientId)?.mcName;
  const pos = queuePosition(db, o);
  const tokens = tokensOf(o, db);
  return (
    <Link to={{ page: 'order', id: o.id }} className="order-row">
      <span className="mono num muted">#{o.number}</span>
      <span className="order-row-main">
        <span className="order-row-title">{o.title}{o.quantity ? ` × ${o.quantity}` : ''}{o.farmTier ? ` · T${o.farmTier}` : ''}</span>
        <span className="small muted"><span className="mc">{other}</span> · {fmtDate(o.createdAt, lang, false)}{pos ? ` · ${t('order.queuePos', { n: pos })}` : ''}</span>
      </span>
      <span className="order-row-tail">
        {tokens.map((tok) => <TokenPill key={tok.id} token={tok} />)}
        <StatusChip status={o.status} />
      </span>
    </Link>
  );
}

export function MyOrdersPage() {
  const { t, db, me } = useStore();
  if (!me) return <Empty><Link to={{ page: 'signin' }}>{t('order.signInFirst')}</Link></Empty>;
  const mine = db.orders.filter((o) => o.clientId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = mine.filter(isOpen);
  const closed = mine.filter((o) => !isOpen(o));
  return (
    <section className="stack">
      <div className="page-head">
        <h1>{t('orders.title')}</h1>
        <p className="lead">{t('orders.lead', { n: open.length, max: CONFIG.maxOpenOrdersPerClient })}</p>
      </div>
      <h2>{t('orders.open')}</h2>
      {open.length ? <div className="order-list">{open.map((o) => <OrderRow key={o.id} o={o} perspective="client" />)}</div>
        : <Empty>{t('orders.noneOpen')} <Link to={{ page: 'home' }}>{t('orders.browse')}</Link></Empty>}
      {closed.length > 0 && (<>
        <h2>{t('orders.closed')}</h2>
        <div className="order-list">{closed.map((o) => <OrderRow key={o.id} o={o} perspective="client" />)}</div>
      </>)}
    </section>
  );
}

// ---------- Single order ----------

function TermsBox({ o, role }: { o: Order; role: 'client' | 'seller' }) {
  const { t, run, me, lang } = useStore();
  const [price, setPrice] = useState(o.terms?.price ?? o.offer);
  const [days, setDays] = useState(o.terms?.days ?? 3);
  const [note, setNote] = useState(o.terms?.note ?? '');
  const [editing, setEditing] = useState(!o.terms);
  const [err, setErr] = useState<string | null>(null);
  const negotiable = o.status === 'received';

  return (
    <div className="card stack-sm">
      <h3>{t('terms.title')}</h3>
      <div className="kv"><span>{t('terms.offer')}</span><span>{o.offer || '—'}</span></div>
      {o.terms && !(role === 'seller' && editing && negotiable) && (
        <>
          <div className="kv"><span>{t('terms.price')}</span><strong>{o.terms.price}</strong></div>
          <div className="kv"><span>{t('terms.days')}</span><span>{t('terms.daysN', { n: o.terms.days })}</span></div>
          {o.terms.note && <div className="kv"><span>{t('terms.note')}</span><span>{o.terms.note}</span></div>}
          <div className="kv"><span>{t('terms.state')}</span>
            <span>{o.terms.acceptedAt ? <span className="chip chip-completed">{t('terms.accepted', { date: fmtDate(o.terms.acceptedAt, lang) })}</span>
              : <span className="chip chip-delivered">{t('terms.pending')}</span>}</span></div>
          {o.dueAt && <div className="kv"><span>{t('terms.due')}</span><span>{fmtDate(o.dueAt, lang)}</span></div>}
        </>
      )}
      {role === 'client' && negotiable && o.terms && !o.terms.acceptedAt && (
        <div className="actions">
          <button type="button" id="accept-terms" className="btn primary" onClick={() => setErr(run(acceptTerms(o.id, me!.id)))}>{t('terms.accept')}</button>
          <span className="muted small">{t('terms.counterHint')}</span>
        </div>
      )}
      {role === 'client' && negotiable && !o.terms && <p className="muted small">{t('terms.waitingSeller')}</p>}
      {role === 'seller' && negotiable && (editing ? (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); const r = run(proposeTerms(o.id, me!.id, price, days, note)); setErr(r); if (!r) setEditing(false); }}>
          <Field label={t('terms.price')} htmlFor="t-price"><input id="t-price" value={price} onChange={(e) => setPrice(e.target.value)} maxLength={200} /></Field>
          <Field label={t('terms.days')} htmlFor="t-days"><input id="t-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
          <Field label={t('terms.note')} htmlFor="t-note"><input id="t-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
          <div className="actions"><button type="submit" className="btn primary">{o.terms ? t('terms.repropose') : t('terms.propose')}</button>
            {o.terms && <button type="button" className="btn ghost" onClick={() => setEditing(false)}>{t('common.back')}</button>}</div>
        </form>
      ) : <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>{t('terms.change')}</button>)}
      <ErrorLine msg={err} />
    </div>
  );
}

function Messages({ o }: { o: Order }) {
  const { t, db, me, run, lang } = useStore();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const closed = !isOpen(o) && o.completedAt && Date.parse(o.completedAt) < Date.now() - 30 * DAY;
  return (
    <div className="card stack-sm">
      <h3>{t('msg.title')}</h3>
      <div className="thread">
        {o.messages.length === 0 && <p className="muted small">{t('msg.none')}</p>}
        {o.messages.map((m) => {
          const mine = m.authorId === me?.id;
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              <div className="msg-meta"><AccountName account={db.accounts.find((a) => a.id === m.authorId)} /> · {fmtDate(m.at, lang)}</div>
              <div className="msg-text">{m.text}</div>
            </div>
          );
        })}
      </div>
      {!closed && (
        <form className="msg-form" onSubmit={(e) => { e.preventDefault(); const r = run(sendMessage(o.id, me!.id, text)); setErr(r); if (!r) setText(''); }}>
          <label htmlFor="msg-input" className="sr">{t('msg.label')}</label>
          <textarea id="msg-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('msg.placeholder')} maxLength={1000} />
          <button type="submit" className="btn" disabled={!text.trim()}>{t('msg.send')}</button>
        </form>
      )}
      <ErrorLine msg={err} />
    </div>
  );
}

function RatingForm({ o }: { o: Order }) {
  const { t, run, me, showToast } = useStore();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<Partial<RatingTags>>({});
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="card stack-sm" onSubmit={(e) => {
      e.preventDefault();
      const clean = Object.fromEntries(Object.entries(tags).filter(([, v]) => v)) as Partial<RatingTags>;
      const r = run(rate(o.id, me!.id, { stars, tags: clean })); setErr(r); if (!r) showToast(t('rating.thanks'));
    }}>
      <h3>{t('rating.title')}</h3>
      <div className="rate-row"><span>{t('rating.overall')}</span><StarInput id="r-overall" value={stars} onChange={setStars} label={t('rating.overall')} /></div>
      {(['speed', 'quality', 'communication', 'accuracy'] as const).map((k) => (
        <div key={k} className="rate-row small"><span>{t(`rating.tag.${k}`)}</span>
          <StarInput id={`r-${k}`} value={tags[k] ?? 0} onChange={(n) => setTags({ ...tags, [k]: n })} label={t(`rating.tag.${k}`)} /></div>
      ))}
      <p className="muted small">{t('rating.hint')}</p>
      <ErrorLine msg={err} />
      <div className="actions"><button type="submit" className="btn primary" disabled={!stars}>{t('rating.submit')}</button></div>
    </form>
  );
}

function ClientActions({ o }: { o: Order }) {
  const { t, run, me, now, lang, showToast } = useStore();
  const [complaint, setComplaint] = useState('');
  const [showComplaint, setShowComplaint] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const deadline = o.deliveredAt ? new Date(Date.parse(o.deliveredAt) + CONFIG.approvalWindowDays * DAY).toISOString() : '';
  return (
    <>
      {o.status === 'delivered' && (
        <div className="card stack-sm attention">
          <h3>{t('client.checkTitle')}</h3>
          <p>{t('client.checkBody', { date: fmtDate(deadline, lang), rel: relDays(deadline, now, t) })}</p>
          <div className="actions">
            <button type="button" id="approve" className="btn primary" onClick={() => { const r = run(approve(o.id, me!.id)); setErr(r); if (!r) showToast(t('client.approved')); }}>{t('client.approve')}</button>
            <button type="button" className="btn" onClick={() => setShowComplaint((v) => !v)}>{t('client.complain')}</button>
          </div>
          {showComplaint && (
            <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); const r = run(complain(o.id, me!.id, complaint)); setErr(r); if (!r) setShowComplaint(false); }}>
              <Field label={t('client.complaintLabel')} htmlFor="c-text"><textarea id="c-text" rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></Field>
              <button type="submit" className="btn">{t('client.complaintSend')}</button>
            </form>
          )}
        </div>
      )}
      {o.status === 'completed' && !o.rating && <RatingForm o={o} />}
      {o.status === 'completed' && o.rating && (
        <div className="card stack-sm"><h3>{t('rating.yours')}</h3><Stars value={o.rating.stars} /></div>
      )}
      {(o.status === 'received' || o.status === 'cleared') && (
        <div className="card stack-sm">
          <p className="muted small">{o.status === 'received' ? t('client.cancelHintReceived') : t('client.cancelHintCleared')}</p>
          <ConfirmButton id="cancel-client" label={t('client.cancel')} confirmLabel={t('client.cancelConfirm')} onConfirm={() => setErr(run(cancelByClient(o.id, me!.id)))} />
        </div>
      )}
      <ErrorLine msg={err} />
    </>
  );
}

function SellerActions({ o }: { o: Order }) {
  const { t, run, me, db, lang, now } = useStore();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const seller = db.sellers.find((s) => s.id === o.sellerId)!;
  const inWork = db.orders.filter((x) => x.sellerId === seller.id && (x.status === 'processing' || x.status === 'fulfilling')).length;
  const go = (fn: Parameters<typeof run>[0]) => setErr(run(fn));
  const deadline = o.deliveredAt ? new Date(Date.parse(o.deliveredAt) + CONFIG.approvalWindowDays * DAY).toISOString() : '';
  return (
    <div className="card stack-sm attention">
      <h3>{t('seller.nextStep')}</h3>
      {o.status === 'received' && (<>
        <p>{!o.terms ? t('sa.proposeFirst') : !o.terms.acceptedAt ? t('sa.waitAccept') : t('sa.canClear')}</p>
        <div className="actions">
          <button type="button" id="clear-order" className="btn primary" disabled={!o.terms?.acceptedAt} onClick={() => go(clearOrder(o.id, me!.id))}>{t('sa.clear')}</button>
        </div>
        <Field label={t('sa.declineNote')} htmlFor="s-note"><input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        <ConfirmButton id="decline" label={t('sa.decline')} confirmLabel={t('sa.declineConfirm')} onConfirm={() => go(declineOrder(o.id, me!.id, note))} />
      </>)}
      {o.status === 'cleared' && (<>
        <p>{t('sa.start')}{inWork >= seller.maxConcurrent ? ` ${t('sa.atCapacity', { n: inWork, max: seller.maxConcurrent })}` : ''}</p>
        <button type="button" id="start" className="btn primary" onClick={() => go(startProcessing(o.id, me!.id))}>{t('sa.startBtn')}</button>
      </>)}
      {o.status === 'processing' && (<>
        <p>{o.complaints.some((c) => !c.resolvedAt) && o.history.at(-1)?.note === 'complaint' ? t('sa.reworkComplaint') : t('sa.processing')}</p>
        <button type="button" id="fulfil" className="btn primary" onClick={() => go(startFulfilling(o.id, me!.id))}>{t('sa.fulfilBtn')}</button>
      </>)}
      {o.status === 'fulfilling' && (<>
        <p>{o.batches > 1 ? t('sa.batchProgress', { done: o.batchesDelivered, total: o.batches }) : o.kind === 'farm' ? t('sa.farmTest') : t('sa.deliverAll')}</p>
        <div className="progress" aria-hidden="true"><span style={{ width: `${(o.batchesDelivered / o.batches) * 100}%` }} /></div>
        <button type="button" id="deliver" className="btn primary" onClick={() => go(deliverBatch(o.id, me!.id))}>
          {o.batchesDelivered + 1 < o.batches ? t('sa.deliverBatch', { n: o.batchesDelivered + 1 }) : t('sa.markDone')}
        </button>
      </>)}
      {o.status === 'delivered' && <p>{t('sa.waitingClient', { date: fmtDate(deadline, lang), rel: relDays(deadline, now, t) })}</p>}
      {(o.status === 'completed' || o.status === 'cancelled' || o.status === 'declined') && <p className="muted">{t('sa.closed')}</p>}
      {['cleared', 'processing', 'fulfilling'].includes(o.status) && (
        <ConfirmButton id="cancel-seller" className="btn ghost small" label={t('sa.cancel')} confirmLabel={t('sa.cancelConfirm')} onConfirm={() => go(cancelBySeller(o.id, me!.id, note))} />
      )}
      <ErrorLine msg={err} />
    </div>
  );
}

export function OrderPage({ id }: { id: string }) {
  const { t, db, me, lang } = useStore();
  const o = db.orders.find((x) => x.id === id);
  if (!o) return <Empty>{t('err.orderMissing')}</Empty>;
  const seller = db.sellers.find((s) => s.id === o.sellerId)!;
  const client = db.accounts.find((a) => a.id === o.clientId);
  const role: 'client' | 'seller' | null = me?.id === o.clientId ? 'client' : me?.id === seller.accountId ? 'seller' : null;
  if (!role) return <Empty>{t('err.notAllowed')}</Empty>;
  const svc = db.services.find((s) => s.id === o.serviceId);
  const pos = queuePosition(db, o);
  const ahead = pos ? sellerQueue(db, seller.id).findIndex((x) => x.id === o.id) : 0;
  const tokens = tokensOf(o, db);

  return (
    <section className="stack">
      <Link to={role === 'seller' ? { page: 'backstage' } : { page: 'orders' }} className="back">← {role === 'seller' ? t('nav.backstage') : t('nav.myOrders')}</Link>
      <div className="order-head">
        <div>
          <div className="mono muted">#{o.number} · {svc?.name[lang] ?? o.title}</div>
          <h1>{o.title}{o.quantity ? ` × ${o.quantity}${o.unit ? ` ${o.unit}` : ''}` : ''}</h1>
          <div className="small muted">
            {role === 'seller' ? <>{t('order.from')} <AccountName account={client} /></> : <>{t('order.by')} <span className="mc">{seller.displayName}</span></>}
            {' · '}{fmtDate(o.createdAt, lang)}
          </div>
        </div>
        <div className="row wrap-row">{tokens.map((tok) => <TokenPill key={tok.id} token={tok} />)}<StatusChip status={o.status} /></div>
      </div>

      {pos && <p className="notice">{t('order.queueLine', { n: pos, d: estimateWaitDays(seller, ahead) })}</p>}

      <div className="order-grid">
        <div className="stack">
          <div className="card"><StatusTimeline order={o} /></div>
          <div className="card stack-sm">
            <h3>{t('order.details')}</h3>
            {o.farmTier && <div className="kv"><span>{t('order.f.tier')}</span><span>T{o.farmTier} · {svc?.tiers?.find((x) => x.tier === o.farmTier)?.label[lang]}</span></div>}
            {o.extras.length > 0 && <div className="kv"><span>{t('order.f.extras')}</span><span>{o.extras.map((x) => svc?.extras?.find((e) => e.id === x)?.name[lang] ?? x).join(', ')}</span></div>}
            {o.kind === 'farm' && <div className="kv"><span>{t('order.materials')}</span><span>{o.clientProvidesMaterials ? t('order.materialsClient') : t('order.materialsSeller')}</span></div>}
            {o.batches > 1 && <div className="kv"><span>{t('order.f.batches')}</span><span className="num">{o.batchesDelivered} / {o.batches}</span></div>}
            <div className="kv"><span>{t('order.f.delivery')}</span><span>{t(`delivery.${o.deliveryMethod}`)}</span></div>
            <div className="kv"><span>{t('order.f.coords')}</span><Coords c={o.coords} /></div>
            {o.details && <div className="kv"><span>{t('order.f.details')}</span><span className="pre">{o.details}</span></div>}
            {o.complaints.map((c, i) => <div key={i} className="kv"><span>{t('order.complaint')}</span><span>{c.text} <span className="muted small">({fmtDate(c.at, lang)})</span></span></div>)}
            {o.autoCompleted && <p className="muted small">{t('order.autoCompleted', { n: CONFIG.approvalWindowDays })}</p>}
          </div>
          <TermsBox o={o} role={role} />
        </div>
        <div className="stack">
          {role === 'seller' ? <SellerActions o={o} /> : <ClientActions o={o} />}
          <Messages o={o} />
          <details className="card log">
            <summary>{t('order.log')}</summary>
            <ol className="log-list">
              {o.history.map((h, i) => (
                <li key={i}><span className="mono small">{fmtDate(h.at, lang)}</span> {t(`status.short.${h.status}`)}
                  {h.note?.startsWith('batch:') ? ` · ${t('order.batchLog', { n: h.note.slice(6) })}` : h.note ? ` · ${h.note === 'complaint' ? t('order.complaint') : h.note}` : ''}</li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </section>
  );
}
