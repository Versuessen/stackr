import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link } from '../ui/router';
import {
  AccountName, ConfirmButton, Coords, Empty, ErrorLine, Field, PageHead, StarInput, Stars, StatusChip, TokenPill, Tracker, fmtDate, fmtN, relDays,
} from '../ui/components';
import { Glyph, ICONS, PixelArt, iconFor } from '../ui/Pixel';
import {
  acceptTerms, approve, cancelByClient, cancelBySeller, clearOrder, complain, declineOrder, deliverBatch, proposeTerms, rate,
  sendMessage, startFulfilling, startProcessing,
} from '../data/actions';
import { CONFIG, DAY, estimateWaitDays, isOpen, queuePosition, sellerQueue, tokensOf } from '../domain/rules';
import { cartTotals, piecesOf, slotsOf } from '../domain/items';
import type { Order, RatingTags } from '../domain/types';
import { unitLabel } from './Items';

export function orderSummary(o: Order, t: (k: string, v?: Record<string, string | number>) => string) {
  if (o.lines?.length) return `${t(o.lines.length + (o.customLines?.length ?? 0) === 1 ? 'cart.nLine' : 'cart.nLines', { n: o.lines.length + (o.customLines?.length ?? 0) })} · ${t('qty.slots', { n: cartTotals(o.lines).slots })}`;
  if (o.farmTier) return `${t('farm.tierN', { n: o.farmTier })}`;
  if (o.quantity) return `× ${o.quantity}${o.unit ? ` ${o.unit}` : ''}`;
  return t(`kind.${o.kind}`);
}

/** What the order is, in a few words: item names for cart orders, the title otherwise. */
export function orderName(o: Order, lang: 'de' | 'en') {
  if (!o.lines?.length) return o.title;
  const names = o.lines.map((l) => (lang === 'de' ? l.de : l.en));
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

export function OrderRow({ o, perspective }: { o: Order; perspective: 'client' | 'seller' }) {
  const { t, db, lang } = useStore();
  const other = perspective === 'client' ? db.sellers.find((s) => s.id === o.sellerId)?.displayName : db.accounts.find((a) => a.id === o.clientId)?.mcName;
  const pos = queuePosition(db, o);
  const tokens = tokensOf(o, db);
  const icon = o.kind === 'farm' ? ICONS.iron : o.kind === 'custom' ? ICONS.scroll : o.lines?.[0] ? iconFor({ id: o.lines[0].itemId, cat: o.lines[0].stack === 1 ? 'tools' : 'materials' }) : ICONS.ingot;
  return (
    <Link to={{ page: 'order', id: o.id }} className="order-row card">
      <span className="cline-img"><PixelArt art={icon} size={32} /></span>
      <span className="order-row-main">
        <span className="order-row-title"><span className="mute num">#{o.number}</span> {orderName(o, lang)}</span>
        <span className="t-small mute">{orderSummary(o, t)} · <span className="mc">{other}</span> · {fmtDate(o.createdAt, lang, false)}{pos ? ` · ${t('order.queuePos', { n: pos })}` : ''}</span>
      </span>
      <span className="order-row-tail">
        <Tracker order={o} compact />
        {tokens.map((tok) => <TokenPill key={tok.id} token={tok} />)}
        <StatusChip status={o.status} perspective={perspective} />
      </span>
    </Link>
  );
}

export function MyOrdersPage() {
  const { t, db, me } = useStore();
  if (!me) return <div className="wrap shop"><Empty title={t('order.signInFirstTitle')} action={<Link to={{ page: 'signin' }} className="btn btn-primary">{t('nav.signIn')}</Link>}>{t('order.signInFirst')}</Empty></div>;
  const mine = db.orders.filter((o) => o.clientId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = mine.filter(isOpen), closed = mine.filter((o) => !isOpen(o));
  return (
    <div className="wrap shop">
      <PageHead crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.myOrders')}</span></>}
        title={t('nav.myOrders')} lead={t('orders.lead', { n: open.length, max: CONFIG.maxOpenOrdersPerClient })} />
      <section className="block-gap" aria-labelledby="h-open">
        <h2 className="t-title" id="h-open">{t('orders.open')} <span className="mute num">{open.length}</span></h2>
        {open.length ? <div className="order-list">{open.map((o) => <OrderRow key={o.id} o={o} perspective="client" />)}</div>
          : <Empty title={t('orders.noneOpen')} action={<div className="row-gap"><Link to={{ page: 'items' }} className="btn btn-primary">{t('home.ctaItems')}</Link><Link to={{ page: 'farm', id: 'iron' }} className="btn btn-secondary">{t('home.ctaFarm')}</Link></div>} />}
      </section>
      {closed.length > 0 && (
        <section className="block-gap" aria-labelledby="h-closed">
          <h2 className="t-title" id="h-closed">{t('orders.closed')} <span className="mute num">{closed.length}</span></h2>
          <div className="order-list">{closed.map((o) => <OrderRow key={o.id} o={o} perspective="client" />)}</div>
        </section>
      )}
    </div>
  );
}

// ---------- Single order ----------

function TermsBlock({ o, role }: { o: Order; role: 'client' | 'seller' }) {
  const { t, run, me, lang } = useStore();
  const [price, setPrice] = useState(o.terms?.price ?? o.offer);
  const [days, setDays] = useState(o.terms?.days ?? 3);
  const [note, setNote] = useState(o.terms?.note ?? '');
  const [editing, setEditing] = useState(!o.terms);
  const [err, setErr] = useState<string | null>(null);
  const negotiable = o.status === 'received';
  return (
    <section className="card side-card" aria-labelledby="h-terms">
      <h2 className="t-title" id="h-terms">{t('terms.title')}</h2>
      <dl className="kv">
        <div><dt>{t('terms.offer')}</dt><dd>{o.offer || '—'}</dd></div>
        {o.terms && !(role === 'seller' && editing && negotiable) && (<>
          <div><dt>{t('terms.price')}</dt><dd><b>{o.terms.price}</b></dd></div>
          <div><dt>{t('terms.days')}</dt><dd>{t('terms.daysN', { n: o.terms.days })}</dd></div>
          {o.terms.note && <div><dt>{t('terms.note')}</dt><dd>{o.terms.note}</dd></div>}
          <div><dt>{t('terms.state')}</dt><dd>{o.terms.acceptedAt ? <span className="badge b-ok">{t('terms.accepted', { date: fmtDate(o.terms.acceptedAt, lang, false) })}</span> : <span className="badge b-warn">{t('terms.pending')}</span>}</dd></div>
          {o.dueAt && <div><dt>{t('terms.due')}</dt><dd className="num">{fmtDate(o.dueAt, lang)}</dd></div>}
        </>)}
      </dl>
      {role === 'client' && negotiable && !o.terms && <p className="t-small ink2">{t('terms.waitingSeller')}</p>}
      {role === 'seller' && negotiable && (editing ? (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); const r = run(proposeTerms(o.id, me!.id, price, days, note)); setErr(r); if (!r) setEditing(false); }}>
          <Field label={t('terms.price')} htmlFor="t-price"><input className="field" id="t-price" value={price} onChange={(e) => setPrice(e.target.value)} maxLength={200} /></Field>
          <Field label={t('terms.days')} htmlFor="t-days"><input className="field num" id="t-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
          <Field label={t('terms.note')} htmlFor="t-note"><input className="field" id="t-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
          <div className="row-gap"><button type="submit" className="btn btn-primary">{o.terms ? t('terms.repropose') : t('terms.propose')}</button>
            {o.terms && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('common.back')}</button>}</div>
        </form>
      ) : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>{t('terms.change')}</button>)}
      <ErrorLine msg={err} />
    </section>
  );
}

function Messages({ o }: { o: Order }) {
  const { t, db, me, run, lang } = useStore();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const closed = !isOpen(o) && o.completedAt && Date.parse(o.completedAt) < Date.now() - 30 * DAY;
  const seller = db.sellers.find((s) => s.id === o.sellerId);
  return (
    <section id="chat" className="card chat" aria-labelledby="h-chat">
      <div className="card-head"><h2 className="t-title" id="h-chat">{t('msg.title')}</h2><span className="t-small mute">{t('msg.private', { name: seller?.displayName ?? '' })}</span></div>
      <ol className="msgs plain" aria-live="polite">
        {o.messages.length === 0 && <li className="t-small mute">{t('msg.none')}</li>}
        {o.messages.map((m) => (
          <li key={m.id} className={`msg ${m.authorId === me?.id ? 'me' : ''}`}>
            <span className="t-label mute"><AccountName account={db.accounts.find((a) => a.id === m.authorId)} /> · {fmtDate(m.at, lang)}</span>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      {!closed && (
        <form className="send" onSubmit={(e) => { e.preventDefault(); const r = run(sendMessage(o.id, me!.id, text)); setErr(r); if (!r) setText(''); }}>
          <label htmlFor="msg-input" className="sr">{t('msg.label')}</label>
          <input className="field" id="msg-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('msg.placeholder')} maxLength={1000} autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>{t('msg.send')}</button>
        </form>
      )}
      <div style={{ padding: '0 20px' }}><ErrorLine msg={err} /></div>
    </section>
  );
}

function RatingForm({ o }: { o: Order }) {
  const { t, run, me, showToast } = useStore();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<Partial<RatingTags>>({});
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="stack-sm" onSubmit={(e) => {
      e.preventDefault();
      const clean = Object.fromEntries(Object.entries(tags).filter(([, v]) => v)) as Partial<RatingTags>;
      const r = run(rate(o.id, me!.id, { stars, tags: clean })); setErr(r); if (!r) showToast(t('rating.thanks'));
    }}>
      <div className="rate"><StarInput id="r-overall" value={stars} onChange={setStars} label={t('rating.overall')} /><span className="t-small ink2">{t(`rating.word.${stars}`)}</span></div>
      <details className="faq"><summary>{t('rating.tagsOptional')}</summary>
        {(['speed', 'quality', 'communication', 'accuracy'] as const).map((k) => (
          <div key={k} className="rate-row"><span className="t-small">{t(`rating.tag.${k}`)}</span><StarInput id={`r-${k}`} size={22} value={tags[k] ?? 0} onChange={(n) => setTags({ ...tags, [k]: n })} label={t(`rating.tag.${k}`)} /></div>
        ))}
      </details>
      <ErrorLine msg={err} />
      <div className="row-gap"><button type="submit" className="btn btn-primary" disabled={!stars}>{t('rating.submit')}</button></div>
    </form>
  );
}

/** The one card that always says what happens next and who acts. */
function NextAction({ o, role }: { o: Order; role: 'client' | 'seller' }) {
  const { t, run, me, db, lang, now, showToast } = useStore();
  const [note, setNote] = useState('');
  const [complaint, setComplaint] = useState('');
  const [showComplaint, setShowComplaint] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seller = db.sellers.find((s) => s.id === o.sellerId)!;
  const client = db.accounts.find((a) => a.id === o.clientId);
  const go = (fn: Parameters<typeof run>[0], toast?: string) => { const r = run(fn); setErr(r); if (!r && toast) showToast(toast); };
  const deadline = o.deliveredAt ? new Date(Date.parse(o.deliveredAt) + CONFIG.approvalWindowDays * DAY).toISOString() : '';
  const inWork = db.orders.filter((x) => x.sellerId === seller.id && (x.status === 'processing' || x.status === 'fulfilling')).length;
  let title = '', body = '';
  let actions: React.ReactNode = null;
  const who = role === 'seller' ? t('next.forSeller', { name: seller.displayName }) : t('next.forClient');

  if (role === 'client') {
    switch (o.status) {
      case 'received':
        if (o.terms && !o.terms.acceptedAt) {
          title = t('next.c.accept'); body = t('next.c.acceptBody', { seller: seller.displayName, price: o.terms.price, n: o.terms.days });
          actions = <button type="button" id="accept-terms" className="btn btn-primary" onClick={() => go(acceptTerms(o.id, me!.id), t('next.c.accepted'))}>{t('terms.accept')}</button>;
        } else if (o.terms?.acceptedAt) { title = t('next.c.waitClear'); body = t('next.c.waitClearBody', { seller: seller.displayName }); }
        else { title = t('next.c.waitTerms'); body = t('next.c.waitTermsBody', { seller: seller.displayName }); }
        break;
      case 'cleared': title = t('next.c.cleared'); body = t('next.c.clearedBody', { seller: seller.displayName }); break;
      case 'processing': title = t('next.c.processing', { seller: seller.displayName }); body = o.dueAt ? t('next.c.processingBody', { date: fmtDate(o.dueAt, lang) }) : ''; break;
      case 'fulfilling': title = o.batches > 1 ? t('next.c.batch', { done: o.batchesDelivered, total: o.batches }) : t('next.c.fulfilling'); body = t('next.c.fulfillingBody'); break;
      case 'delivered':
        title = t('client.checkTitle'); body = t('client.checkBody', { date: fmtDate(deadline, lang), rel: relDays(deadline, now, t) });
        actions = <>
          <button type="button" id="approve" className="btn btn-primary" onClick={() => go(approve(o.id, me!.id), t('client.approved'))}>{t('client.approve')}</button>
          <button type="button" className="btn btn-secondary" aria-expanded={showComplaint} onClick={() => setShowComplaint((v) => !v)}>{t('client.complain')}</button>
        </>;
        break;
      case 'completed': title = o.rating ? t('rating.yours') : t('rating.title'); body = o.rating ? '' : t('rating.hint'); break;
      case 'cancelled': title = t('status.long.cancelled'); body = o.cancelledBy === 'seller' ? t('next.cancelledBySeller') : t('next.cancelledByClient'); break;
      case 'declined': title = t('status.long.declined'); body = t('next.declinedBody'); break;
    }
  } else {
    switch (o.status) {
      case 'received':
        title = !o.terms ? t('next.s.propose') : !o.terms.acceptedAt ? t('next.s.waitAccept') : t('next.s.canClear');
        body = !o.terms ? t('next.s.proposeBody', { name: client?.mcName ?? '', offer: o.offer || '—' }) : !o.terms.acceptedAt ? t('sa.waitAccept') : t('sa.canClear');
        actions = <button type="button" id="clear-order" className="btn btn-primary" disabled={!o.terms?.acceptedAt} onClick={() => go(clearOrder(o.id, me!.id))}>{t('sa.clear')}</button>;
        break;
      case 'cleared': title = t('next.s.start'); body = t('sa.start') + (inWork >= seller.maxConcurrent ? ` ${t('sa.atCapacity', { n: inWork, max: seller.maxConcurrent })}` : '');
        actions = <button type="button" id="start" className="btn btn-primary" onClick={() => go(startProcessing(o.id, me!.id))}>{t('sa.startBtn')}</button>; break;
      case 'processing': title = t('next.s.processing'); body = o.history.at(-1)?.note === 'complaint' ? t('sa.reworkComplaint') : t('sa.processing');
        actions = <button type="button" id="fulfil" className="btn btn-primary" onClick={() => go(startFulfilling(o.id, me!.id))}>{t('sa.fulfilBtn')}</button>; break;
      case 'fulfilling': title = t('next.s.fulfilling'); body = o.batches > 1 ? t('sa.batchProgress', { done: o.batchesDelivered, total: o.batches }) : o.kind === 'farm' ? t('sa.farmTest') : t('sa.deliverAll');
        actions = <button type="button" id="deliver" className="btn btn-primary" onClick={() => go(deliverBatch(o.id, me!.id))}>{o.batchesDelivered + 1 < o.batches ? t('sa.deliverBatch', { n: o.batchesDelivered + 1 }) : t('sa.markDone')}</button>; break;
      case 'delivered': title = t('next.s.waiting', { name: client?.mcName ?? '' }); body = t('sa.waitingClient', { date: fmtDate(deadline, lang), rel: relDays(deadline, now, t) }); break;
      default: title = t(`status.long.${o.status}`); body = t('sa.closed');
    }
  }

  return (
    <section className="next card" aria-labelledby="h-next">
      <p className="t-label eyebrow ink2">{who}</p>
      <h2 className="d-s" id="h-next">{title}</h2>
      {body && <p className="t-lead">{body}</p>}
      {role === 'client' && o.status === 'completed' && !o.rating && <RatingForm o={o} />}
      {role === 'client' && o.status === 'completed' && o.rating && <Stars value={o.rating.stars} />}
      {showComplaint && o.status === 'delivered' && (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); go(complain(o.id, me!.id, complaint)); setShowComplaint(false); }}>
          <Field label={t('client.complaintLabel')} htmlFor="c-text"><textarea className="field" id="c-text" rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></Field>
          <div className="row-gap"><button type="submit" className="btn btn-secondary">{t('client.complaintSend')}</button></div>
        </form>
      )}
      {role === 'seller' && o.status === 'received' && (
        <Field label={t('sa.declineNote')} htmlFor="s-note"><input className="field" id="s-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      )}
      <div className="row-gap">
        {actions}
        {role === 'client' && (o.status === 'received' || o.status === 'cleared') && (
          <ConfirmButton id="cancel-client" label={t('client.cancel')} confirmTitle={t('client.cancelSure')} confirmBody={o.status === 'received' ? t('client.cancelHintReceived') : t('client.cancelHintCleared')} confirmLabel={t('client.cancelConfirm')} onConfirm={() => go(cancelByClient(o.id, me!.id))} />
        )}
        {role === 'seller' && o.status === 'received' && (
          <ConfirmButton id="decline" label={t('sa.decline')} confirmBody={t('sa.declineBody')} confirmLabel={t('sa.declineConfirm')} onConfirm={() => go(declineOrder(o.id, me!.id, note))} />
        )}
        {role === 'seller' && ['cleared', 'processing', 'fulfilling'].includes(o.status) && (
          <ConfirmButton id="cancel-seller" className="btn btn-ghost" label={t('sa.cancel')} confirmBody={t('sa.cancelBody')} confirmLabel={t('sa.cancelConfirm')} onConfirm={() => go(cancelBySeller(o.id, me!.id, note))} />
        )}
        <a className="btn btn-ghost" href="#chat" onClick={(e) => { e.preventDefault(); document.getElementById('chat')?.scrollIntoView({ block: 'start' }); document.getElementById('msg-input')?.focus({ preventScroll: true }); }}><Glyph name="chat" size={14} /> {t('msg.title')}</a>
      </div>
      <ErrorLine msg={err} />
    </section>
  );
}

function Lines({ o }: { o: Order }) {
  const { t, lang, items } = useStore();
  if (!o.lines?.length && !o.customLines?.length) return null;
  const perBatch = Math.ceil((o.lines?.length ?? 0) / Math.max(1, o.batches));
  return (
    <section className="card lines-card" aria-labelledby="h-lines">
      <div className="card-head"><h2 className="t-title" id="h-lines">{t('order.lines')}</h2><span className="t-small mute">{o.batches > 1 ? t('checkout.batchN', { n: o.batches }) : t('checkout.batchAll')}</span></div>
      <ul className="olines plain">
        {o.lines?.map((l, i) => {
          const batch = Math.min(o.batches, Math.floor(i / perBatch) + 1);
          const there = o.status === 'delivered' || o.status === 'completed' || (o.status === 'fulfilling' && batch <= o.batchesDelivered);
          const working = ['processing', 'fulfilling'].includes(o.status);
          const it = items.find((x) => x.id === l.itemId);
          return (
            <li key={i} className="oline">
              <span className="cline-img"><PixelArt art={iconFor(it ?? { id: l.itemId, cat: 'materials' })} size={32} /></span>
              <div className="cline-main"><span className="cline-name">{lang === 'de' ? l.de : l.en}</span>
                <span className="t-small mute num">{unitLabel(t, l.n, l.unit)}{l.unit === 'piece' ? '' : ` = ${fmtN(piecesOf(l), lang)} ${t('unit.pieces')}`} · {t(slotsOf(l) === 1 ? 'qty.slot' : 'qty.slots', { n: slotsOf(l) })}{o.batches > 1 ? ` · ${t('order.batchNo', { n: batch })}` : ''}</span></div>
              <span className={`badge ${there ? 'b-ok' : working ? 'b-info' : 'b-line'}`}>{there ? `✓ ${t('order.lineThere')}` : working ? t('status.short.processing') : t('order.lineOpen')}</span>
            </li>
          );
        })}
        {o.customLines?.map((c, i) => (
          <li key={`c${i}`} className="oline">
            <span className="cline-img"><PixelArt art={ICONS.scroll} size={32} /></span>
            <div className="cline-main"><span className="cline-name">{t('cart.custom')}</span><span className="t-small mute">„{c.text}“</span></div>
            <span className="badge b-line">{t('order.lineOpen')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrderPage({ id }: { id: string }) {
  const { t, db, me, lang } = useStore();
  const o = db.orders.find((x) => x.id === id);
  if (!o) return <div className="wrap shop"><Empty title={t('err.orderMissing')} /></div>;
  const seller = db.sellers.find((s) => s.id === o.sellerId)!;
  const client = db.accounts.find((a) => a.id === o.clientId);
  const role: 'client' | 'seller' | null = me?.id === o.clientId ? 'client' : me?.id === seller.accountId ? 'seller' : null;
  if (!role) return <div className="wrap shop"><Empty title={t('err.notAllowed')} action={<Link to={{ page: 'signin' }} className="btn btn-primary">{t('nav.signIn')}</Link>} /></div>;
  const svc = db.services.find((s) => s.id === o.serviceId);
  const pos = queuePosition(db, o);
  const ahead = pos ? sellerQueue(db, seller.id).findIndex((x) => x.id === o.id) : 0;
  const tokens = tokensOf(o, db);

  return (
    <div className="wrap order">
      <nav className="crumbs" aria-label={t('nav.path')}>
        {role === 'seller' ? <Link to={{ page: 'backstage' }}>{t('nav.backstage')}</Link> : <Link to={{ page: 'orders' }}>{t('nav.myOrders')}</Link>}
        <span aria-hidden="true">/</span><span aria-current="page">#{o.number}</span>
      </nav>
      <div className="o-title">
        <h1 className="d-m">{t('order.titleN', { n: o.number })}</h1>
        <StatusChip status={o.status} perspective={role} />
        {tokens.map((tok) => <TokenPill key={tok.id} token={tok} />)}
        <span className="t-small mute">{svc?.name[lang] ?? o.title} · {o.kind === 'custom' ? o.title : orderSummary(o, t)} · {fmtDate(o.createdAt, lang, false)} · {role === 'seller' ? <>{t('order.from')} <AccountName account={client} /></> : <>{t('order.by')} <span className="mc">{seller.displayName}</span></>}</span>
      </div>
      {pos && <p className="notice" style={{ marginTop: 16 }}>{t('order.queueLine', { n: pos, d: estimateWaitDays(seller, ahead) })}</p>}
      <Tracker order={o} />
      <div className="o-grid">
        <div className="o-main">
          <NextAction o={o} role={role} />
          <Lines o={o} />
          <Messages o={o} />
        </div>
        <aside className="o-side">
          <TermsBlock o={o} role={role} />
          <section className="card side-card" aria-labelledby="h-del">
            <h2 className="t-title" id="h-del">{o.kind === 'farm' ? t('order.build') : t('order.delivery')}</h2>
            <dl className="kv">
              <div><dt>{t('order.f.coords')}</dt><dd><Coords c={o.coords} /></dd></div>
              <div><dt>{t('order.f.delivery')}</dt><dd>{t(`delivery.${o.deliveryMethod}`)}</dd></div>
              {o.farmTier && <div><dt>{t('farm.tier')}</dt><dd>{svc?.tiers?.find((x) => x.tier === o.farmTier)?.label[lang]}</dd></div>}
              {o.extras.length > 0 && <div><dt>{t('order.f.extras')}</dt><dd>{o.extras.map((x) => svc?.extras?.find((e) => e.id === x)?.name[lang] ?? x).join(', ')}</dd></div>}
              {o.kind === 'farm' && <div><dt>{t('order.materials')}</dt><dd>{o.clientProvidesMaterials ? t('order.materialsClient') : t('order.materialsSeller')}</dd></div>}
              {o.batches > 1 && <div><dt>{t('checkout.batches')}</dt><dd className="num">{o.batchesDelivered} / {o.batches}</dd></div>}
              {o.details && <div><dt>{t('order.f.details')}</dt><dd className="pre">{o.details}</dd></div>}
              {o.complaints.map((c, i) => <div key={i}><dt>{t('order.complaint')}</dt><dd>{c.text} <span className="mute t-small">({fmtDate(c.at, lang)})</span></dd></div>)}
            </dl>
            {o.autoCompleted && <p className="t-small mute">{t('order.autoCompleted', { n: CONFIG.approvalWindowDays })}</p>}
          </section>
          <details className="card side-card log">
            <summary className="t-title">{t('order.log')}</summary>
            <ol className="log-list">
              {o.history.map((h, i) => (
                <li key={i}><span className="num t-small mute">{fmtDate(h.at, lang)}</span> {t(`status.short.${h.status}`)}
                  {h.note?.startsWith('batch:') ? ` · ${t('order.batchLog', { n: h.note.slice(6) })}` : h.note ? ` · ${h.note === 'complaint' ? t('order.complaint') : h.note}` : ''}</li>
              ))}
            </ol>
          </details>
        </aside>
      </div>
    </div>
  );
}
