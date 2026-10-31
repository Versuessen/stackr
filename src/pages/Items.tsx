import React, { useMemo, useState } from 'react';
import { useStore, type CartEntry } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { useSearch } from '../ui/search';
import { Glyph, ICONS, PixelArt, iconFor } from '../ui/Pixel';
import { Empty, ErrorLine, Field, PageHead, Stepper, TokenPill, fmtDate, fmtN } from '../ui/components';
import { CATS, SETS, cartTotals, defaultUnit, multOf, searchItems, slotsOf, suggestItem, unitOk, type IndexedItem } from '../domain/items';
import { DIMENSIONS, GROUPS } from '../domain/groups';
import { bulkLimit, checkCanOrder, unusedTokens } from '../domain/rules';
import { MAX_WAVES } from '../data/actions';
import type { Coords, ItemUnit, OrderLine, Token, TokenType } from '../domain/types';

const PAGE = 20;
const UNITS: ItemUnit[] = ['piece', 'stack', 'shulker'];
/** From this many shulker boxes on, the checkout suggests delivery in waves. */
const WAVE_HINT_SHULKERS = 3;

export function unitLabel(t: (k: string, v?: Record<string, string | number>) => string, n: number, unit: ItemUnit) {
  return `${n} ${t(`unit.${unit}${n === 1 ? '' : 's'}`)}`;
}

/** Amount + unit picker shared by the result rows and the item page. */
function QtyControls({ it, n, setN, unit, setUnit }: { it: IndexedItem; n: number; setN: (n: number) => void; unit: ItemUnit; setUnit: (u: ItemUnit) => void }) {
  const { t, lang } = useStore();
  const name = lang === 'de' ? it.de : it.en;
  return (
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
  );
}

function InCartBadge({ it }: { it: IndexedItem }) {
  const { t, cart } = useStore();
  const inCart = cart.filter((c): c is OrderLine => !c.custom && c.itemId === it.id);
  if (!inCart.length) return null;
  return <span className="badge b-info"><Glyph name="check" size={10} /> {inCart.map((c) => unitLabel(t, c.n, c.unit)).join(' + ')} {t('cart.inCartShort')}</span>;
}

function ItemBadges({ it }: { it: IndexedItem }) {
  const { t } = useStore();
  return (
    <div className="row-badges">
      <span className="badge b-line">{it.stack > 1 ? t('item.stackN', { n: it.stack }) : t('item.unstackable')}</span>
      <span className="badge b-line">{t(`cat.${it.cat}`)}</span>
      {it.dims.filter((d) => d !== 'overworld').map((d) => <span key={d} className={`badge dim-${d}`}>{t(`dim.${d}`)}</span>)}
      <InCartBadge it={it} />
    </div>
  );
}

function ResultRow({ it }: { it: IndexedItem }) {
  const { t, lang, addToCart } = useStore();
  const [n, setN] = useState(1);
  const [unit, setUnit] = useState<ItemUnit>(defaultUnit(it));
  const [done, setDone] = useState(false);
  const pcs = n * multOf(it, unit), slots = Math.ceil(pcs / it.stack);
  const name = lang === 'de' ? it.de : it.en, other = lang === 'de' ? it.en : it.de;
  return (
    <li className="row card">
      <Link to={{ page: 'item', id: it.id }} className="row-img" aria-hidden="true" tabIndex={-1}><PixelArt art={iconFor(it)} size={48} /></Link>
      <div className="row-main">
        <h3 className="row-name"><Link to={{ page: 'item', id: it.id }} className="row-link">{name}</Link></h3>
        <p className="t-small mute row-sub">{other} · <span className="mono">{it.id}</span></p>
        <ItemBadges it={it} />
      </div>
      <div className="row-act">
        <QtyControls it={it} n={n} setN={setN} unit={unit} setUnit={setUnit} />
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

/** Small cart summary next to the search results. The full cart is its own page. */
function MiniCart() {
  const { t, cart, lang } = useStore();
  const lines = cart.filter((c): c is OrderLine & { custom?: false } => !c.custom);
  const totals = cartTotals(lines);
  return (
    <aside className="cart card side-frame" aria-labelledby="h-mini">
      <div className="cart-head"><h2 className="t-title" id="h-mini">{t('nav.cart')}</h2><span className="badge b-slime num">{t(cart.length === 1 ? 'cart.nLine' : 'cart.nLines', { n: cart.length })}</span></div>
      {cart.length === 0 ? (
        <div className="cart-empty"><p className="accent">{t('cart.empty')}</p><p className="t-small ink2">{t('cart.emptyBody')}</p></div>
      ) : (
        <div className="mini">
          <ul className="plain mini-lines">
            {cart.slice(0, 6).map((c, i) => (
              <li key={i}><span className="min0 ell">{c.custom ? t('cart.custom') : lang === 'de' ? c.de : c.en}</span><span className="t-small mute num">{c.custom ? '' : unitLabel(t, c.n, c.unit)}</span></li>
            ))}
            {cart.length > 6 && <li className="t-small mute">{t('cart.more', { n: cart.length - 6 })}</li>}
          </ul>
          <p className="t-small ink2 num" style={{ margin: 0 }}>{t('qty.slots', { n: fmtN(totals.slots, lang) })} · {t('cart.shulkersN', { n: fmtN(totals.shulkers, lang) })}</p>
          <Link to={{ page: 'cart' }} className="btn btn-primary btn-block">{t('cart.review')} <Glyph name="arrow" size={14} /></Link>
        </div>
      )}
    </aside>
  );
}

export function ItemsPage() {
  const { t, items, itemsState, itemsVersion, lang, cart, setCart, showToast } = useStore();
  const { q, setQ, cat, setCat, group, setGroup, dim, setDim, set, setSet } = useSearch();
  const [shown, setShown] = useState(PAGE);
  const all = useMemo(() => {
    const base = set
      ? SETS[set].map((id) => items.find((it) => it.id === id)).filter((it): it is IndexedItem => !!it && (cat === 'all' || it.cat === cat))
      : searchItems(items, q, cat, lang);
    return base.filter((it) => (!group || it.groups.includes(group)) && (!dim || it.dims.includes(dim)));
  }, [items, q, cat, set, lang, group, dim]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: items.length }; items.forEach((it) => { c[it.cat] = (c[it.cat] ?? 0) + 1; }); return c; }, [items]);
  const groupCounts = useMemo(() => { const c: Record<string, number> = {}; items.forEach((it) => it.groups.forEach((g) => { c[g] = (c[g] ?? 0) + 1; })); return c; }, [items]);
  const query = q.trim();
  const sug = !all.length && query && itemsState === 'ready' ? suggestItem(items, query, lang) : null;
  const lines = cart.filter((c): c is OrderLine & { custom?: false } => !c.custom);
  const totals = cartTotals(lines);
  const filtered = cat !== 'all' || !!group || !!dim;
  const title = set ? t(`world.${set}Set`) : query ? t('items.hits', { n: fmtN(all.length, lang), q: query }) : filtered ? t('items.filtered', { n: fmtN(all.length, lang) }) : t('items.popularFirst');
  const left = all.length - Math.min(all.length, shown);
  const reset = () => { setCat('all'); setGroup(''); setDim(''); setShown(PAGE); };

  return (
    <div className="wrap shop">
      <PageHead
        crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.items')}</span></>}
        title={t('nav.items')}
        lead={t('items.lead', { n: fmtN(items.length || 1537, lang), v: itemsVersion })}
        aside={<div className="unit-key card" aria-label={t('items.unitsLabel')}><span><b>1 {t('unit.stack')}</b> = {t('items.keyStack')}</span><span><b>1 {t('unit.shulker')}</b> = {t('items.keyShulker')}</span><span><b>1 {t('qty.slotWord')}</b> = {t('items.keySlot')}</span></div>}
      />
      <div className="filters">
        <div className="filter-row">
          <span className="t-label mute filter-label" id="f-cat">{t('items.catLabel')}</span>
          <div className="scroller" role="group" aria-labelledby="f-cat">
            {(['all', ...CATS] as const).map((c) => (
              <button key={c} className="chip" type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setShown(PAGE); }}>{c === 'all' ? t('cat.all') : t(`cat.${c}`)}<span className="cnt">{fmtN(counts[c] ?? 0, lang)}</span></button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="t-label mute filter-label" id="f-group">{t('items.groupLabel')}</span>
          <div className="scroller" role="group" aria-labelledby="f-group">
            {GROUPS.map((g) => (
              <button key={g} className="chip" type="button" aria-pressed={group === g} onClick={() => { setGroup(group === g ? '' : g); setShown(PAGE); }}>{t(`group.${g}`)}<span className="cnt">{fmtN(groupCounts[g] ?? 0, lang)}</span></button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="t-label mute filter-label" id="f-dim">{t('items.dimLabel')}</span>
          <div className="seg" role="radiogroup" aria-labelledby="f-dim">
            {(['', ...DIMENSIONS] as const).map((d) => (
              <button key={d || 'all'} type="button" role="radio" aria-checked={dim === d} onClick={() => { setDim(d); setShown(PAGE); }}>{d ? t(`dim.${d}`) : t('cat.all')}</button>
            ))}
          </div>
          <span className="t-small mute dim-note">{t('items.dimNote')}</span>
        </div>
      </div>
      <div className="shop-grid">
        <section aria-labelledby="h-res" aria-busy={itemsState === 'loading'}>
          <div className="res-head">
            <h2 className="t-title" id="h-res" aria-live="polite">{itemsState === 'loading' ? t('items.loading') : title}</h2>
            {itemsState === 'ready' && !query && !set && !filtered && <span className="t-small mute">{t('items.meta', { n: fmtN(all.length, lang) })}</span>}
            {filtered && <button className="tlink linkish t-small" type="button" onClick={reset}>{t('items.filtersClear')}</button>}
            {set && <button className="chip" type="button" aria-pressed="true" onClick={() => setSet('')} style={{ minHeight: 36 }}>{t(`world.${set}Set`)} <Glyph name="x" size={10} /><span className="sr">{t('items.clearSet')}</span></button>}
          </div>
          {itemsState === 'loading' && <div className="rows">{[0, 1, 2].map((i) => <div key={i} className="row card skel" />)}</div>}
          {itemsState === 'failed' && <div className="card empty"><p className="t-title">{t('items.failed')}</p><p className="t-body ink2">{t('items.failedBody')}</p></div>}
          <ul className="rows plain" aria-label={t('items.results')}>
            {all.slice(0, shown).map((it) => <ResultRow key={it.id} it={it} />)}
          </ul>
          {itemsState === 'ready' && all.length === 0 && (
            <div className="card empty">
              <p className="d-s">{query ? t('items.none', { q: query }) : t('items.noneFiltered')}</p>
              {sug && <p className="t-lead">{t('search.didYouMean')} <button className="tlink inline" type="button" onClick={() => setQ(lang === 'de' ? sug.de : sug.en)}>{lang === 'de' ? sug.de : sug.en}</button>?</p>}
              {query && <p className="t-body ink2">{t('items.customHint')}</p>}
              <div className="hero-cta">
                {query && <button className="btn btn-secondary" type="button" onClick={() => { const prev = cart; setCart([...cart, { custom: true, text: query }]); showToast(<><b>{t('cart.custom')}</b> „{query}“ {t('cart.added')}</>, { label: t('common.undo'), run: () => setCart(prev) }); }}>{t('items.asCustom', { q: query })}</button>}
                {filtered && <button className="btn btn-ghost" type="button" onClick={reset}>{t('items.filtersClear')}</button>}
                {query && <button className="btn btn-ghost" type="button" onClick={() => setQ('')}>{t('search.clear')}</button>}
              </div>
            </div>
          )}
          {left > 0 && <div className="center-row"><button className="btn btn-secondary" type="button" onClick={() => setShown(shown + PAGE)}>{t('items.more', { n: Math.min(PAGE, left), left: fmtN(left, lang) })}</button></div>}
        </section>
        <MiniCart />
      </div>
      {cart.length > 0 && (
        <div className="mbar"><span className="t-small"><b className="num">{t(cart.length === 1 ? 'cart.nLine' : 'cart.nLines', { n: cart.length })}</b> · <span className="num">{t('qty.slots', { n: totals.slots })}</span></span>
          <Link to={{ page: 'cart' }} className="btn btn-slime btn-sm"><Glyph name="cart" size={14} /> {t('cart.toCart')}</Link></div>
      )}
    </div>
  );
}

/** One item: pick the amount and unit, see what it adds up to, then add it to the cart. */
export function ItemPage({ id }: { id: string }) {
  const { t, items, itemsState, lang, addToCart, cart } = useStore();
  const { setGroup, setCat, setDim, setQ } = useSearch();
  const { go } = useRouter();
  const it = items.find((x) => x.id === id);
  const [n, setN] = useState(1);
  const [unit, setUnit] = useState<ItemUnit>(() => (it ? defaultUnit(it) : 'piece'));
  const [added, setAdded] = useState(false);
  // The item list may still be loading on a direct visit: pick the sensible unit once it arrives.
  const loadedId = it?.id;
  React.useEffect(() => { if (it) setUnit(defaultUnit(it)); }, [loadedId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (itemsState === 'loading') return <div className="wrap shop"><p className="t-body ink2">{t('items.loading')}</p></div>;
  if (!it) return <div className="wrap shop"><Empty title={t('item.notFound')} action={<Link to={{ page: 'items' }} className="btn btn-primary">{t('nav.items')}</Link>} /></div>;
  const name = lang === 'de' ? it.de : it.en, other = lang === 'de' ? it.en : it.de;
  const pcs = n * multOf(it, unit), slots = Math.ceil(pcs / it.stack), shulkers = slots / 27;
  const quick: { n: number; unit: ItemUnit }[] = ([
    { n: 1, unit: 'stack' }, { n: 1, unit: 'shulker' }, { n: 2, unit: 'shulker' }, { n: 5, unit: 'shulker' },
  ] as { n: number; unit: ItemUnit }[]).filter((x) => unitOk(it, x.unit));
  const related = items
    .filter((x) => x.id !== it.id && (it.groups.length ? x.groups.some((g) => it.groups.includes(g)) : x.cat === it.cat))
    .sort((a, b) => b.pop - a.pop).slice(0, 8);
  const inCart = cart.some((c) => !c.custom && c.itemId === it.id);
  const add = () => { addToCart(it, n, unit); setAdded(true); };

  return (
    <div className="wrap shop">
      <nav className="crumbs" aria-label={t('nav.path')}>
        <Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span>
        <Link to={{ page: 'items' }}>{t('nav.items')}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>
      <div className="item-grid">
        <div className="item-hero card">
          <span className="item-img"><PixelArt art={iconFor(it)} size={128} /></span>
          <div className="stack-sm">
            <h1 className="d-m">{name}</h1>
            <p className="t-body ink2" style={{ margin: 0 }}>{other} · <span className="mono">{it.id}</span></p>
            <ItemBadges it={it} />
            <dl className="kv item-facts">
              <div><dt>{t('item.stackSize')}</dt><dd className="num">{it.stack}</dd></div>
              <div><dt>{t('item.perShulker')}</dt><dd className="num">{fmtN(it.stack * 27, lang)}</dd></div>
              <div><dt>{t('item.foundIn')}</dt><dd>{it.dims.map((d) => t(`dim.${d}`)).join(', ')}</dd></div>
              {it.groups.length > 0 && <div><dt>{t('items.groupLabel')}</dt><dd>{it.groups.map((g) => (
                <button key={g} type="button" className="tlink linkish" onClick={() => { setQ(''); setCat('all'); setDim(''); setGroup(g); go({ page: 'items' }); }}>{t(`group.${g}`)}</button>
              )).reduce<React.ReactNode[]>((a, b, i) => (i ? [...a, ', ', b] : [b]), [])}</dd></div>}
            </dl>
          </div>
        </div>
        <section className="item-buy card side-frame" aria-labelledby="h-buy">
          <h2 className="t-title" id="h-buy">{t('item.howMuch')}</h2>
          {quick.length > 0 && (
            <div className="quick" role="group" aria-label={t('item.quick')}>
              {quick.map((x) => (
                <button key={`${x.n}${x.unit}`} type="button" className="chip" aria-pressed={n === x.n && unit === x.unit} onClick={() => { setN(x.n); setUnit(x.unit); setAdded(false); }}>{unitLabel(t, x.n, x.unit)}</button>
              ))}
            </div>
          )}
          <QtyControls it={it} n={n} setN={(v) => { setN(v); setAdded(false); }} unit={unit} setUnit={(u) => { setUnit(u); setAdded(false); }} />
          <dl className="kv item-sum">
            <div><dt>{t('cart.pieces')}</dt><dd className="num">{fmtN(pcs, lang)}</dd></div>
            <div><dt>{t('cart.slots')}</dt><dd className="num">{fmtN(slots, lang)}</dd></div>
            <div><dt>{t('cart.shulkers')}</dt><dd className="num">{fmtN(Math.round(shulkers * 10) / 10, lang)}</dd></div>
          </dl>
          {shulkers >= WAVE_HINT_SHULKERS && <p className="notice t-small">{t('waves.hintItem')}</p>}
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={add}>{added ? `✓ ${t('cart.inCart')}` : t('cart.add')}</button>
          {(added || inCart) && <Link to={{ page: 'cart' }} className="btn btn-secondary btn-block">{t('cart.review')} <Glyph name="arrow" size={14} /></Link>}
          <Link to={{ page: 'items' }} className="tlink t-small">{t('item.back')}</Link>
        </section>
      </div>
      {related.length > 0 && (
        <section className="sec-sm" aria-labelledby="h-rel">
          <h2 className="t-title" id="h-rel">{t('item.related')}</h2>
          <ul className="plain rel-grid">
            {related.map((r) => (
              <li key={r.id}><Link to={{ page: 'item', id: r.id }} className="rel card"><PixelArt art={iconFor(r)} size={32} /><span className="min0 ell">{lang === 'de' ? r.de : r.en}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
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
      <Link to={{ page: 'item', id: entry.itemId }} className="cline-img" tabIndex={-1} aria-hidden="true"><PixelArt art={iconFor(items.find((x) => x.id === entry.itemId) ?? { id: entry.itemId, cat: 'materials' })} size={32} /></Link>
      <div className="cline-main">
        <Link to={{ page: 'item', id: entry.itemId }} className="cline-name">{name}</Link>
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

/** Optional delivery in waves: the client decides, nothing is forced. */
function Waves({ slots, shulkers, split, setSplit, waves, setWaves, dates, setDates }: {
  slots: number; shulkers: number; split: boolean; setSplit: (b: boolean) => void; waves: number; setWaves: (n: number) => void; dates: string[]; setDates: (d: string[]) => void;
}) {
  const { t, lang } = useStore();
  const max = Math.min(MAX_WAVES, slots);
  if (max < 2) return null;
  const today = new Date().toISOString().slice(0, 10);
  const per = Math.ceil(slots / waves);
  return (
    <fieldset className="coords waves">
      <legend>{t('waves.title')}</legend>
      <label className="check"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        <span>{t('waves.toggle')}<span className="t-small mute" style={{ display: 'block' }}>{t('waves.toggleHint')}</span></span></label>
      {!split && shulkers >= WAVE_HINT_SHULKERS && <p className="notice t-small" style={{ margin: 0 }}>{t('waves.hint', { n: fmtN(Math.round(shulkers * 10) / 10, lang) })}</p>}
      {split && (
        <>
          <Field label={t('waves.count')} htmlFor="w-count">
            <select className="field" id="w-count" value={waves} onChange={(e) => setWaves(Number(e.target.value))}>
              {Array.from({ length: max - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{t('waves.nWaves', { n, per: fmtN(Math.ceil(slots / n), lang) })}</option>)}
            </select>
          </Field>
          <ol className="plain wave-list">
            {Array.from({ length: waves }, (_, i) => (
              <li key={i}>
                <label htmlFor={`w-d${i}`} className="t-small"><b>{t('waves.waveN', { n: i + 1 })}</b> <span className="mute">≈ {t('qty.slots', { n: fmtN(i < waves - 1 ? per : slots - per * (waves - 1), lang) })}</span></label>
                <input type="date" className="field" id={`w-d${i}`} min={(i > 0 && dates[i - 1]) || today} value={dates[i] ?? ''}
                  onChange={(e) => { const next = [...dates]; next[i] = e.target.value; setDates(next.slice(0, waves)); }} />
              </li>
            ))}
          </ol>
          <p className="t-small mute" style={{ margin: 0 }}>{t('waves.datesNote')}</p>
        </>
      )}
    </fieldset>
  );
}

function Checkout({ lines, customs }: { lines: OrderLine[]; customs: CartEntry[] }) {
  const { t, db, me, now, lang, runForId, setCart, showToast } = useStore();
  const { go } = useRouter();
  const seller = db.sellers[0];
  const svc = db.services.find((s) => s.kind === 'material' && s.active);
  const [coords, setCoords] = useState<{ x: string; y: string; z: string; dimension: Coords['dimension'] }>({ x: '', y: '', z: '', dimension: 'overworld' });
  const [split, setSplit] = useState(false);
  const [waves, setWaves] = useState(2);
  const [dates, setDates] = useState<string[]>([]);
  const [offer, setOffer] = useState('');
  const [note, setNote] = useState('');
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [tos, setTos] = useState(false);
  const [vacAck, setVacAck] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!coordsOk || !tos || (seller.vacation.on && !vacAck)) return;
    if (busy) return;
    const title = lines.length === 1 && !customs.length ? (lang === 'de' ? lines[0].de : lines[0].en) : t('order.nLines', { n: lines.length + customs.length });
    setBusy(true);
    const nWaves = split ? waves : 1;
    const { error: r, id } = await runForId({ type: 'placeOrder', input: {
      serviceId: svc.id, title, details: note, lines,
      customLines: customs.map((x) => ({ text: (x as { text: string }).text })),
      batches: nWaves, waveDates: nWaves > 1 && dates.some(Boolean) ? Array.from({ length: nWaves }, (_, i) => dates[i] ?? '') : undefined,
      extras: [], coords: { ...c, dimension: coords.dimension }, deliveryMethod: 'place_at_coords',
      clientProvidesMaterials: false, offer, tokenIds, tosAccepted: tos, vacationAcknowledged: vacAck,
    } });
    setBusy(false);
    if (r || !id) { setErr(r); return; }
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
      <Waves slots={totals.slots} shulkers={totals.slots / 27} split={split} setSplit={setSplit} waves={waves} setWaves={setWaves} dates={dates} setDates={setDates} />
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
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!check.ok || overLimit || busy} aria-busy={busy}>{t('checkout.submit')} <Glyph name="arrow" size={14} /></button>
      <p className="t-small mute" style={{ margin: 0 }}>{t('order.submitNote')}</p>
    </form>
  );
}

/** The cart as its own page: review every line, then check out on the right. */
export function CartPage() {
  const { t, cart, lang } = useStore();
  const lines = cart.filter((c): c is OrderLine & { custom?: false } => !c.custom);
  const customs = cart.filter((c) => c.custom);
  const totals = cartTotals(lines);
  const full = Math.floor(totals.slots / 27), rest = totals.slots % 27;
  const cells = Array.from({ length: 27 }, (_, i) => i < (rest || (totals.slots ? 27 : 0)));
  const vizText = totals.slots === 0 ? t('cart.vizEmpty') : full && rest ? t('cart.vizFullRest', { f: full, r: rest }) : full ? t('cart.vizFull', { f: full }) : t('cart.vizRest', { r: rest });
  return (
    <div className="wrap shop">
      <div className="shop-grid cart-page">
        <section aria-labelledby="h-cart">
          <PageHead
            crumbs={<><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><Link to={{ page: 'items' }}>{t('nav.items')}</Link><span aria-hidden="true">/</span><span aria-current="page">{t('nav.cart')}</span></>}
            title={t('cart.pageTitle')} lead={cart.length ? t('cart.pageLead') : undefined} />
          {cart.length === 0 ? (
            <Empty title={t('cart.empty')} action={<Link to={{ page: 'items' }} className="btn btn-primary">{t('nav.items')} <Glyph name="arrow" size={14} /></Link>}>{t('cart.emptyBody')}</Empty>
          ) : (
            <div className="card cart-review">
              <div className="cart-head"><h2 className="t-title" id="h-cart">{t('cart.positions')}</h2><span className="badge b-slime num">{t(cart.length === 1 ? 'cart.nLine' : 'cart.nLines', { n: cart.length })}</span></div>
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
              <div className="cart-foot"><Link to={{ page: 'items' }} className="btn btn-ghost"><Glyph name="search" size={14} /> {t('cart.continue')}</Link></div>
            </div>
          )}
        </section>
        {cart.length > 0 && (
          <aside id="checkout" className="cart card side-frame" aria-labelledby="h-checkout">
            <div className="cart-head"><h2 className="t-title" id="h-checkout">{t('cart.checkoutTitle')}</h2></div>
            <Checkout lines={lines} customs={customs} />
          </aside>
        )}
      </div>
    </div>
  );
}
