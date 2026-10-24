import React, { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { Empty, ErrorLine, Field, TokenPill, fmtDate } from '../ui/components';
import { placeOrder } from '../data/actions';
import { bulkLimit, checkCanOrder, clientStats, publicWaitDays, unusedTokens } from '../domain/rules';
import type { Coords, FarmTier, Token, TokenType } from '../domain/types';

export function NewOrderPage({ serviceId }: { serviceId: string }) {
  const { t, db, lang, me, run, now, showToast } = useStore();
  const { go } = useRouter();
  const svc = db.services.find((s) => s.id === serviceId);
  const seller = svc ? db.sellers.find((s) => s.id === svc.sellerId) : undefined;

  const [title, setTitle] = useState(svc && svc.kind !== 'custom' ? svc.name[lang] : '');
  const [details, setDetails] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState(svc?.unitHint?.[lang] ?? '');
  const [batches, setBatches] = useState(1);
  const [tier, setTier] = useState<FarmTier>(1);
  const [extras, setExtras] = useState<string[]>([]);
  const [ownMaterials, setOwnMaterials] = useState(false);
  const [delivery, setDelivery] = useState<'place_at_coords' | 'hand_over'>('place_at_coords');
  const [coords, setCoords] = useState<{ x: string; y: string; z: string; dimension: Coords['dimension'] }>({ x: '', y: '', z: '', dimension: 'overworld' });
  const [offer, setOffer] = useState('');
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [tos, setTos] = useState(false);
  const [vacAck, setVacAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myTokens = useMemo(() => (me ? unusedTokens(db, me.id) : []), [db, me]);
  if (!svc || !seller) return <Empty>{t('err.serviceMissing')}</Empty>;
  if (!me) return <Empty><Link to={{ page: 'signin' }}>{t('order.signInFirst')}</Link></Empty>;

  const chosen = tokenIds.map((id) => myTokens.find((x) => x.id === id)).filter(Boolean) as Token[];
  const has = (type: TokenType) => chosen.some((x) => x.type === type);
  const check = checkCanOrder(db, seller, me.id, now, has('extra_slot'));
  const blockingWithoutSlot = checkCanOrder(db, seller, me.id, now, true);
  const maxTier = clientStats(db, me.id).maxFarmTier;
  const limit = bulkLimit(seller.levelState.level);
  const isFarm = svc.kind === 'farm';
  const needsCoords = isFarm || delivery === 'place_at_coords';

  const toggleToken = (tok: Token) => {
    setTokenIds((ids) => {
      if (ids.includes(tok.id)) return ids.filter((i) => i !== tok.id);
      const sameType = myTokens.filter((x) => ids.includes(x.id) && x.type === tok.type).map((x) => x.id);
      return [...ids.filter((i) => !sameType.includes(i)), tok.id];
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const c = { x: num(coords.x), y: num(coords.y), z: num(coords.z) };
    const hasCoords = [c.x, c.y, c.z].every(Number.isFinite);
    if (needsCoords && !hasCoords) { setError(t('err.coordsRequired')); return; }
    let newId = '';
    const err = run(placeOrder({
      clientId: me.id, serviceId: svc.id, title, details,
      quantity: svc.kind === 'material' ? quantity : undefined,
      unit: svc.kind === 'material' ? unit : undefined,
      batches: svc.kind === 'material' ? batches : 1,
      farmTier: isFarm ? tier : undefined, extras,
      coords: hasCoords ? { ...c, dimension: coords.dimension } : undefined,
      deliveryMethod: isFarm ? 'build_at_coords' : delivery,
      clientProvidesMaterials: ownMaterials, offer, tokenIds, tosAccepted: tos, vacationAcknowledged: vacAck,
    }, (id) => { newId = id; }));
    if (err) { setError(err); return; }
    showToast(t('order.placed'));
    go({ page: 'order', id: newId });
  };

  return (
    <section className="stack">
      <Link to={{ page: 'seller', id: seller.id }} className="back">← <span className="mc">{seller.displayName}</span></Link>
      <div className="page-head">
        <h1>{svc.name[lang]}</h1>
        <p className="lead">{t('order.lead', { seller: seller.displayName, n: publicWaitDays(db, seller) })}</p>
      </div>

      {!blockingWithoutSlot.ok && (
        <div className="notice bad">{blockingWithoutSlot.reasons.map((r) => <p key={r}>{t(r)}</p>)}</div>
      )}

      <form className="card form" onSubmit={submit} noValidate>
        <fieldset disabled={!blockingWithoutSlot.ok}>
          <Field label={t('order.f.title')} htmlFor="f-title">
            <input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          </Field>

          {svc.kind === 'material' && (
            <div className="grid-3">
              <Field label={t('order.f.quantity')} htmlFor="f-qty" hint={limit === null ? undefined : t('order.f.quantityMax', { n: limit })}>
                <input id="f-qty" type="number" min={1} max={limit ?? undefined} inputMode="numeric" value={quantity}
                  onChange={(e) => { const q = Math.max(1, Number(e.target.value) || 1); setQuantity(q); setBatches((b) => Math.min(b, q)); }} />
              </Field>
              <Field label={t('order.f.unit')} htmlFor="f-unit">
                <input id="f-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} />
              </Field>
              <Field label={t('order.f.batches')} htmlFor="f-batches" hint={t('order.f.batchesHint')}>
                <select id="f-batches" value={batches} onChange={(e) => setBatches(Number(e.target.value))}>
                  {Array.from({ length: Math.min(quantity, 10) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? t('order.f.batchAll') : t('order.f.batchN', { n, each: Math.ceil(quantity / n) })}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {isFarm && svc.tiers && (
            <Field label={t('order.f.tier')} htmlFor="f-tier" hint={t('order.f.tierHint', { n: maxTier })}>
              <div className="choice-row" id="f-tier" role="radiogroup">
                {svc.tiers.map((x) => {
                  const locked = x.tier > maxTier && !has('high_effort');
                  return (
                    <label key={x.tier} className={`choice ${tier === x.tier ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                      <input type="radio" name="tier" value={x.tier} checked={tier === x.tier} disabled={locked} onChange={() => setTier(x.tier)} />
                      <span className="choice-title">T{x.tier}</span>
                      <span className="small">{x.label[lang]}</span>
                      {locked && <span className="small muted">{t('order.f.tierLocked')}</span>}
                    </label>
                  );
                })}
              </div>
            </Field>
          )}

          {isFarm && svc.extras && (
            <Field label={t('order.f.extras')} htmlFor="f-extras">
              <div className="check-col" id="f-extras">
                {svc.extras.map((x) => (
                  <label key={x.id} className="check">
                    <input type="checkbox" checked={extras.includes(x.id)} onChange={(e) => setExtras((xs) => e.target.checked ? [...xs, x.id] : xs.filter((i) => i !== x.id))} />
                    {x.name[lang]}
                  </label>
                ))}
                <label className="check">
                  <input type="checkbox" id="f-own" checked={ownMaterials} onChange={(e) => setOwnMaterials(e.target.checked)} />
                  {t('order.f.ownMaterials')}
                </label>
              </div>
            </Field>
          )}

          {svc.kind === 'material' && (
            <Field label={t('order.f.delivery')} htmlFor="f-delivery">
              <select id="f-delivery" value={delivery} onChange={(e) => setDelivery(e.target.value as typeof delivery)}>
                <option value="place_at_coords">{t('delivery.place_at_coords')}</option>
                <option value="hand_over">{t('delivery.hand_over')}</option>
              </select>
            </Field>
          )}

          {needsCoords && (
            <Field label={isFarm ? t('order.f.coordsFarm') : t('order.f.coords')} htmlFor="f-x" hint={isFarm ? t('order.f.coordsFarmHint') : undefined}>
              <div className="coords-row">
                {(['x', 'y', 'z'] as const).map((k) => (
                  <input key={k} id={`f-${k}`} aria-label={k.toUpperCase()} placeholder={k.toUpperCase()} inputMode="numeric"
                    value={coords[k]} onChange={(e) => setCoords({ ...coords, [k]: e.target.value.replace(/[^\d-]/g, '') })} />
                ))}
                <select id="f-dim" aria-label={t('order.f.dimension')} value={coords.dimension} onChange={(e) => setCoords({ ...coords, dimension: e.target.value as Coords['dimension'] })}>
                  <option value="overworld">{t('dim.overworld')}</option>
                  <option value="nether">{t('dim.nether')}</option>
                  <option value="end">{t('dim.end')}</option>
                </select>
              </div>
            </Field>
          )}

          <Field label={svc.kind === 'custom' ? t('order.f.detailsCustom') : t('order.f.details')} htmlFor="f-details">
            <textarea id="f-details" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1500} />
          </Field>

          <Field label={t('order.f.offer')} htmlFor="f-offer" hint={t('order.f.offerHint')}>
            <input id="f-offer" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} placeholder={t('order.f.offerPlaceholder')} />
          </Field>

          <Field label={t('order.f.tokens')} htmlFor="f-tokens" hint={myTokens.length ? t('order.f.tokensHint') : t('order.f.noTokens')}>
            <div className="token-pick" id="f-tokens">
              {myTokens.map((tok) => (
                <label key={tok.id} className={`token-option ${tokenIds.includes(tok.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={tokenIds.includes(tok.id)} onChange={() => toggleToken(tok)} />
                  <TokenPill token={tok} />
                  <span className="small muted">{t(`token.desc.${tok.type}`)}</span>
                </label>
              ))}
            </div>
          </Field>

          {seller.vacation.on && (
            <label className="check notice warn">
              <input type="checkbox" id="f-vac" checked={vacAck} onChange={(e) => setVacAck(e.target.checked)} />
              <span>{t('order.f.vacationAck', { seller: seller.displayName, date: fmtDate(seller.lastOnlineAt, lang) })}</span>
            </label>
          )}

          <label className="check">
            <input type="checkbox" id="f-tos" checked={tos} onChange={(e) => setTos(e.target.checked)} />
            <span>{t('order.f.tos')} <Link to={{ page: 'terms' }}>{t('nav.terms')}</Link></span>
          </label>

          {!check.ok && blockingWithoutSlot.ok && <p className="notice warn">{t('check.openLimit')}</p>}
          <ErrorLine msg={error} />
          <div className="actions">
            <button type="submit" className="btn primary" disabled={!check.ok}>{t('order.submit')}</button>
            <span className="muted small">{t('order.submitNote')}</span>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
