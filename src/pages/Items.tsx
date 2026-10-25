import React, { useMemo, useState } from 'react';
import { useStore, type CartEntry } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { useSearch } from '../ui/search';
import { Glyph, ICONS, PixelArt, iconFor } from '../ui/Pixel';
import { ErrorLine, Field, PageHead, Stepper, TokenPill, fmtDate, fmtN } from '../ui/components';
import { CATS, SETS, cartTotals, defaultUnit, multOf, searchItems, slotsOf, suggestItem, unitOk, type IndexedItem } from '../domain/items';
import { bulkLimit, checkCanOrder, unusedTokens } from '../domain/rules';
import { placeOrder } from '../data/actions';
import type { Coords, ItemUnit, OrderLine, Token, TokenType } from '../domain/types';

const PAGE = 20;
const UNITS: ItemUnit[] = ['piece', 'stack', 'shulker'];

function ResultRow({ it }: { it: IndexedItem }) {
  const { t, lang, cart, addToCart } = useStore();
  const [n, setN] = useState(1);
  const [unit, setUnit] = useState<ItemUnit>(defaultUnit(it));
  const [done, setDone] = useState(false);
  const inCart = cart.filter((c): c is OrderLine => !c.custom && c.itemId === it.id);
  const pcs = n * multOf(it, unit), slots = Math.ceil(pcs / it.stack);
  const name = lang === 'de' ? it.de : it.en, other = lang === 'de' ? it.en : it.de;
  return (
    <li className="row card">
      <span className="row-img"><PixelArt art={iconFor(it)} size={48} /></span>
      <div className="row-main">
        <h3 className="row-name">{name}</h3>
        <p className="t-small mute row-sub">{other} · <span className="mono">{it.id}</span></p>
        <div className="row-badges">
          <span className="badge b-line">{it.stack > 1 ? t('item.stackN', { n: it.stack }) : t('item.unstackable')}</span>
          <span className="badge b-line">{t(`cat.${it.cat}`)}</span>
          {inCart.length > 0 && <span className="badge b-info"><Glyph name="check" size={10} /> {inCart.map((c) => unitLabel(t, c.n, c.unit)).join(' + ')} {t('cart.inCartShort')}</span>}
        </div>
      </div>
      <div className="row-act">
        <div className="row-ctl">
          <Stepper value={n} onChange={(v) => setN(Math.max(1, Math.min(999, v)))} label={t('qty.of', { name })} max={999} />
          <div className="seg" role="radiogroup" aria-label={t('qty.unitFor', { name })}>
            {UNITS.map((u) => {
              const ok = unitOk(it, u);
              return (
                <button key={u} type="button" role="radio" aria-checked={unit === u} disabled={!ok} title={ok ? undefined : t(it.stack === 1 ? 'qty.noStack' : 'qty.noShulker')} onClick={() => setUnit(u)}>
                  {t(`unit.${u}`)}<small>× {fmtN(multOf(it, u), lang)}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="row-buy">
          <span className="t-small mute num">{unit === 'piece' ? '' : `= ${fmtN(pcs, lang)} ${t('unit.pieces')} · `}{t(slots === 1 ? 'qty.slot' : 'qty.slots', { n: fmtN(slots, lang) })}</span>
          <button type="button" className={`btn btn-primary ${done ? 'done' : ''}`} onClick={() => { addToCart(it, n, unit); setDone(true); window.setTimeout(() => setDone(false), 1600); }}>
            {done ? `✓ ${t('cart.inCart')}` : t('cart.add')}
          </button>
        </div>
      </div>
    </li>
  );
}

export function unitLabel(t: (k: string, v?: Record<string, string | number>) => string, n: number, unit: ItemUnit) {
  return `${n} ${t(`unit.${unit}${n === 1 ? '' : 's'}`)}`;
}

function CartLine({ entry, index }: { entry: CartEntry; index: number }) {
  const { t, lang, cart, setCart, showToast, items } = useStore();
  const remove = () => {
    const prev = cart;
    setCart(cart.filter((_, i) => i !== index));
    showToast(<><b>{entry.custom ? t('cart.custom') : lang === 'de' ? entry.de : entry.en}</b> {t('cart.removed')}</>, { label: t('common.undo'), run: () => setCart(prev) });
  };
  if (entry.custom) {
    return (
      <li className="cline">
        <span className="cline-img"><PixelArt art={ICONS.scroll} size={32} /></span>
        <div className="cline-main"><span className="cline-name">{t('cart.custom')}</span><span className="t-small mute">„{entry.text}“ · {t('cart.customNote')}</span></div>
        <button className="icon-btn" type="button" aria-label={t('cart.remove', { name: t('cart.custom') })} onClick={remove}><Glyph name="x" size={12} /></button>
      </li>
    );
  }
  const name = lang === 'de' ? entry.de : entry.en;
  const pcs = entry.n * multOf(entry, entry.unit), slots = slotsOf(entry);
  const update = (patch: Partial<OrderLine>) => setCart(cart.map((c, i) => (i === index ? { ...c, ...patch } as CartEntry : c)));
  return (
    <li className="cline">
      <span className="cline-img"><PixelArt art={iconFor(items.find((x) => x.id === entry.itemId) ?? { id: entry.itemId, cat: 'materials' })} size={32} /></span>
      <div className="cline-main">
        <span className="cline-name">{name}</span>
        <span className="t-small mute num">{unitLabel(t, entry.n, entry.unit)}{entry.unit === 'piece' ? '' : ` = ${fmtN(pcs, lang)} ${t('unit.pieces')}`} · {t(slots === 1 ? 'qty.slot' : 'qty.slots', { n: slots })}</span>
        <div className="cline-ctl">
          <Stepper value={entry.n} removeAtMin decLabel={entry.n === 1 ? t('cart.remove', { name }) : t('qty.less')} label={t('qty.of', { name })}
            onChange={(v) => (v < 1 ? remove() : update({ n: v }))} />
          <label className="sr" htmlFor={`u-${index}`}>{t('qty.unitFor', { name })}</label>
          <select className="field cline-unit" id={`u-${index}`} value={entry.unit} onChange={(e) => update({ unit: e.target.value as ItemUnit })}>
            {UNITS.filter((u) => unitOk(entry, u)).map((u) => <option key={u} value={u}>{t(`unit.${u}`)}{u === 'piece' ? '' : ` (${fmtN(multOf(entry, u), lang)})`}</option>)}
          </select>
        </div>
      </div>
      <button className="icon-btn" type="button" aria-label={t('cart.remove', { name })} onClick={remove}><Glyph name="x" size={12} /></button>
    </li>
  );
}

function Checkout({ lines, customs }: { lines: OrderLine[]; customs: CartEntry[] }) {
  const { t, db, me, now, lang, run, setCart, showToast } = useStore();
  const { go } = useRouter();
  const seller = db.sellers[0];
  const svc = db.services.find((s) => s.kind === 'material' && s.active);
  const [coords, setCoords] = useState<{ x: string; y: string; z: string; dimension: Coords['dimension'] }>({ x: '', y: '', z: '', dimension: 'overworld' });
  const [batches, setBatches] = useState(1);
  const [offer, setOffer] = useState('');
  const [note, setNote] = useState('');
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [tos, setTos] = useState(false);
  const [vacAck, setVacAck] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const myTokens = useMemo(() => (me ? unusedTokens(db, me.id) : []), [db, me]);
  const totals = cartTotals(lines);
  if (!seller || !svc) return null;
  if (!me) {
    return (
      <div className="cart-form">
        <p className="t-small ink2">{t('checkout.signInFirst')}</p>
        <Link to={{ page: 'signin' }} className="btn btn-primary btn-lg btn-block">{t('checkout.signIn')} <Glyph name="arrow" size={14} /></Link>
      </div>
    );
  }
  const chosen = tokenIds.map((id) => myTokens.find((x) => x.id === id)).filter(Boolean) as Token[];
  const has = (type: TokenType) => chosen.some((x) => x.type === type);
  const check = checkCanOrder(db, seller, me.id, now, has('extra_slot'));
  const limit = bulkLimit(seller.levelState.level);
  const overLimit = limit !== null && totals.slots > limit;
  const num = (v: string) => (v.trim() === '' || v.trim() === '-' ? NaN : Number(v));
  const c = { x: num(coords.x), y: num(coords.y), z: num(coords.z) };
  const coordsOk = [c.x, c.y, c.z].every(Number.isFinite);
  const toggleToken = (tok: Token) => setTokenIds((ids) => {
    if (ids.includes(tok.id)) return ids.filter((i) => i !== tok.id);
    const same = myTokens.filter((x) => ids.includes(x.id) && x.type === tok.type).map((x) => x.id);
    return [...ids.filter((i) => !same.includes(i)), tok.id];
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!coordsOk || !tos || (seller.vacation.on && !vacAck)) return;
    let id = '';
    const title = lines.length === 1 && !customs.length ? (lang === 'de' ? lines[0].de : lines[0].en) : t('order.nLines', { n: lines.length + customs.length });
    const r = run(placeOrder({
      clientId: me.id, serviceId: svc.id, title, details: note, lines,
      customLines: customs.map((x) => ({ text: (x as { text: string }).text })),
      batches, extras: [], coords: { ...c, dimension: coords.dimension }, deliveryMethod: 'place_at_coords',
      clientProvidesMaterials: false, offer, tokenIds, tosAccepted: tos, vacationAcknowledged: vacAck,
    }, (x) => { id = x; }));
    if (r) { setErr(r); return; }
    setCart([]);
    showToast(t('order.placed'));
    go({ page: 'order', id });
  };
  const coordErr = tried && !coordsOk;
  return (
    <form className="cart-form" onSubmit={submit} noValidate>
      {!check.ok && <div className="notice bad">{check.reasons.map((r) => <p key={r}>{t(r)}</p>)}</div>}
      {overLimit && <p className="notice warn">{t('err.bulkLimit', { limit: limit! })}</p>}
      <fieldset className="coords">
        <legend>{t('checkout.coords')}</legend>
        <div className="xyz">
          {(['x', 'y', 'z'] as const).map((k) => (
            <input key={k} className="field num" inputMode="numeric" aria-label={k.toUpperCase()} placeholder={k.toUpperCase()} value={coords[k]}
              aria-invalid={coordErr} aria-describedby={coordErr ? 'e-coords' : undefined}
              onChange={(e) => setCoords({ ...coords, [k]: e.target.value.replace(/[^\d-]/g, '') })} />
          ))}
          <select className="field" aria-label={t('order.f.dimension')} value={coords.dimension} onChange={(e) => setCoords({ ...coords, dimension: e.target.value as Coords['dimension'] })}>
            <option value="overworld">{t('dim.overworld')}</option><option value="nether">{t('dim.nether')}</option><option value="end">{t('dim.end')}</option>
          </select>
        </div>
        {coordErr && <p className="err" id="e-coords"><Glyph name="info" size={12} /> {t('err.coordsRequired')}</p>}
      </fieldset>
      <Field label={t('checkout.batches')} htmlFor="c-batches" hint={t('checkout.batchesHint')}>
        <select className="field" id="c-batches" value={batches} onChange={(e) => setBatches(Number(e.target.value))}>
          {[1, 2, 3].filter((n) => n <= Math.max(1, totals.slots)).map((n) => <option key={n} value={n}>{n === 1 ? t('checkout.batchAll') : t('checkout.batchN', { n })}</option>)}
        </select>
      </Field>
      <Field label={t('order.f.offer')} htmlFor="c-offer" hint={t('order.f.offerHint')}>
        <input className="field" id="c-offer" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} placeholder={t('order.f.offerPlaceholder')} />
      </Field>
      <Field label={t('checkout.note')} htmlFor="c-note">
        <textarea className="field" id="c-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('checkout.notePh')} />
      </Field>
      {myTokens.length > 0 && (
        <fieldset className="coords">
          <legend>{t('order.f.tokens')}</legend>
          {myTokens.map((tok) => (
            <label key={tok.id} className="check"><input type="checkbox" checked={tokenIds.includes(tok.id)} onChange={() => toggleToken(tok)} />
              <span><TokenPill token={tok} /> <span className="t-small ink2">{t(`token.desc.${tok.type}`)}</span></span></label>
          ))}
        </fieldset>
      )}
      {seller.vacation.on && (
        <label className="check"><input type="checkbox" checked={vacAck} onChange={(e) => setVacAck(e.target.checked)} aria-invalid={tried && !vacAck} />
          <span>{t('order.f.vacationAck', { seller: seller.displayName, date: fmtDate(seller.lastOnlineAt, lang) })}</span></label>
      )}
      <label className="check"><input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} aria-invalid={tried && !tos} aria-describedby={tried && !tos ? 'e-tos' : undefined} />
        <span>{t('checkout.tos')} <Link to={{ page: 'terms' }}>{t('nav.terms')}</Link>.</span></label>
      {tried && !tos && <p className="err" id="e-tos" style={{ marginTop: -6 }}><Glyph name="info" size={12} /> {t('err.tos')}</p>}
      <ErrorLine msg={err} />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!check.ok || overLimit}>{t('checkout.submit')} <Glyph name="arrow" size={14} /></button>
      <p className="t-small mute" style={{ margin: 0 }}>{t('order.submitNote')}</p>
    </form>
  );
}

export function ItemsPage() {
  const { t, items, itemsState, itemsVersion, lang, cart, setCart, showToast } = useStore();
  const { q, setQ, cat, setCat, set, setSet } = useSearch();
  const [shown, setShown] = useState(PAGE);
  const all = useMemo(() => {
    if (set) return SETS[set].map((id) => items.find((it) => it.id === id)).filter((it): it is IndexedItem => !!it && (cat === 'all' || it.cat === cat));
    return searchItems(items, q, cat, lang);
  }, [items, q, cat, set, lang]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: items.length }; items.forEach((it) => { c[it.cat] = (c[it.cat] ?? 0) + 1; }); return c; }, [items]);
  const query = q.trim();
  const sug = !all.length && query && itemsState === 'ready' ? suggestItem(items, query, lang) : null;
  const lines = cart.filter((c): c is OrderLine & { custom?: false } => !c.custom);
  const customs = cart.filter((c) => c.custom);
  const totals = cartTotals(lines);
  const full = Math.floor(totals.slots / 27), rest = totals.slots % 27;
  const cells = Array.from({ length: 27 }, (_, i) => i < (rest || (totals.slots ? 27 : 0)));
  const title = set ? t(`world.${set}Set`) : query ? t('items.hits', { n: fmtN(all.length, lang), q: query }) : cat !== 'all' ? t(`cat.${cat}`) : t('items.popularFirst');
  const vizText = totals.slots === 0 ? t('cart.vizEmpty') : full && rest ? t('cart.vizFullRest', { f: full, r: rest }) : full ? t('cart.vizFull', { f: full }) : t('cart.vizRest', { r: rest });
  const left = all.length - Math.min(all.length, shown);

  return (
    <div className="wrap shop">
      <PageHead
        crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.items')}</span></>}
        title={t('nav.items')}
        lead={t('items.lead', { n: fmtN(items.length || 1537, lang), v: itemsVersion })}
        aside={<div className="unit-key card" aria-label={t('items.unitsLabel')}><span><b>1 {t('unit.stack')}</b> = {t('items.keyStack')}</span><span><b>1 {t('unit.shulker')}</b> = {t('items.keyShulker')}</span><span><b>1 {t('qty.slotWord')}</b> = {t('items.keySlot')}</span></div>}
      />
      <div className="scroller" role="group" aria-label={t('items.catLabel')} style={{ marginTop: 24 }}>
        {(['all', ...CATS] as const).map((c) => (
          <button key={c} className="chip" type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setShown(PAGE); }}>{c === 'all' ? t('cat.all') : t(`cat.${c}`)}<span className="cnt">{fmtN(counts[c] ?? 0, lang)}</span></button>
        ))}
      </div>
      <div className="shop-grid">
        <section aria-labelledby="h-res" aria-busy={itemsState === 'loading'}>
          <div className="res-head">
            <h2 className="t-title" id="h-res" aria-live="polite">{itemsState === 'loading' ? t('items.loading') : title}</h2>
            {itemsState === 'ready' && !query && !set && <span className="t-small mute">{t('items.meta', { n: fmtN(all.length, lang) })}</span>}
            {set && <button className="chip" type="button" aria-pressed="true" onClick={() => setSet('')} style={{ minHeight: 36 }}>{t(`world.${set}Set`)} <Glyph name="x" size={10} /><span className="sr">{t('items.clearSet')}</span></button>}
          </div>
          {itemsState === 'loading' && <div className="rows">{[0, 1, 2].map((i) => <div key={i} className="row card skel" />)}</div>}
          {itemsState === 'failed' && <div className="card empty"><p className="t-title">{t('items.failed')}</p><p className="t-body ink2">{t('items.failedBody')}</p></div>}
          <ul className="rows plain" aria-label={t('items.results')}>
            {all.slice(0, shown).map((it) => <ResultRow key={it.id} it={it} />)}
          </ul>
          {itemsState === 'ready' && all.length === 0 && (
            <div className="card empty">
              <p className="d-s">{t('items.none', { q: query })}</p>
              {sug && <p className="t-lead">{t('search.didYouMean')} <button className="tlink inline" type="button" onClick={() => setQ(lang === 'de' ? sug.de : sug.en)}>{lang === 'de' ? sug.de : sug.en}</button>?</p>}
              <p className="t-body ink2">{t('items.customHint')}</p>
              <div className="hero-cta">
                <button className="btn btn-secondary" type="button" onClick={() => { const prev = cart; setCart([...cart, { custom: true, text: query }]); showToast(<><b>{t('cart.custom')}</b> „{query}“ {t('cart.added')}</>, { label: t('common.undo'), run: () => setCart(prev) }); }}>{t('items.asCustom', { q: query })}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setQ('')}>{t('search.clear')}</button>
              </div>
            </div>
          )}
          {left > 0 && <div className="center-row"><button className="btn btn-secondary" type="button" onClick={() => setShown(shown + PAGE)}>{t('items.more', { n: Math.min(PAGE, left), left: fmtN(left, lang) })}</button></div>}
        </section>

        <aside id="cart" className="cart card" aria-labelledby="h-cart">
          <div className="cart-head"><h2 className="t-title" id="h-cart">{t('nav.cart')}</h2><span className="badge b-slime num">{t(cart.length === 1 ? 'cart.nLine' : 'cart.nLines', { n: cart.length })}</span></div>
          {cart.length === 0 ? (
            <div className="cart-empty"><p className="accent">{t('cart.empty')}</p><p className="t-small ink2">{t('cart.emptyBody')}</p></div>
          ) : (
            <>
              <ul className="clines plain">{cart.map((c, i) => <CartLine key={c.custom ? `c${i}` : `${c.itemId}-${c.unit}`} entry={c} index={i} />)}</ul>
              <div className="cart-sum">
                <div><span className="t-label mute">{t('cart.slots')}</span><span className="d-s num">{fmtN(totals.slots, lang)}</span></div>
                <div><span className="t-label mute">{t('cart.shulkers')}</span><span className="d-s num">{fmtN(totals.shulkers, lang)}</span></div>
                <div><span className="t-label mute">{t('cart.pieces')}</span><span className="d-s num">{fmtN(totals.pieces, lang)}</span></div>
              </div>
              <div className="shulker-viz" role="img" aria-label={vizText}>
                <div className="sv-grid">{cells.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}</div>
                <span className="t-small mute">{vizText}</span>
              </div>
              <Checkout lines={lines} customs={customs} />
            </>
          )}
        </aside>
      </div>
      {cart.length > 0 && (
        <div className="mbar"><span className="t-small"><b className="num">{t(cart.length === 1 ? 'cart.nLine' : 'cart.nLines', { n: cart.length })}</b> · <span className="num">{t('qty.slots', { n: totals.slots })}</span></span>
          <a className="btn btn-slime btn-sm" href="#cart" onClick={(e) => { e.preventDefault(); document.getElementById('cart')?.scrollIntoView({ block: 'start' }); }}><Glyph name="cart" size={14} /> {t('cart.toCart')}</a></div>
      )}
    </div>
  );
}

