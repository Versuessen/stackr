import { FARM_ICON } from '../ui/Pixel';
import { farmDef } from '../domain/farms';
import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { useSearch } from '../ui/search';
import { Glyph, ICONS, PORTRAIT, PixelArt, SceneArt, iconFor, sceneBg, scenes } from '../ui/Pixel';
import { useReveal } from '../ui/motion';
import { activeEvent } from '../domain/points';
import { POPULAR, defaultUnit, type ItemCat } from '../domain/items';
import { CONFIG, publicWaitDays, sellerStats } from '../domain/rules';
import { fmtN } from '../ui/components';
import type { Service } from '../domain/types';

export const farmKey = (svc: Pick<Service, 'id'>) => svc.id.replace(/^seller-\d+-/, '');
const FARM_DAYS = (key: string) => farmDef(key)?.days[0] ?? 3;

function Hero() {
  const { t, theme, db, now } = useStore();
  const { setSet } = useSearch();
  const [scene, setScene] = useState(0);
  const all = scenes.hero();
  const names = [t('world.overworld'), t('world.nether'), t('world.end')];
  const sw = ['#5fb8ee', '#943434', '#9a6fb0'];
  const bgs = [sceneBg(all[0], theme), '#2a0c10', '#140f24'];
  const s = db.sellers[0];
  const ev = activeEvent(db, now);
  return (
    <section className="wrap" style={{ paddingTop: 24 }} aria-label={t('home.welcome')}>
      <div className="hero frame" style={{ background: bgs[scene] }}>
        {all.map((sc, i) => <div key={i} className="hero-scene" style={{ opacity: i === scene ? 1 : 0 }}><SceneArt scene={sc} /></div>)}
        <div className="hero-panel">
          <p className="t-label mute eyebrow">{t('home.kicker')}</p>
          <h1 className="d-xl">Stackr</h1>
          <p className="accent hero-claim">{t('home.claim')}</p>
          <div className="hero-cta">
            <Link to={{ page: 'items' }} className="btn btn-primary btn-lg" onClick={() => { setSet(''); }}>{t('home.ctaItems')} <Glyph name="arrow" size={14} /></Link>
            <Link to={{ page: 'farm', id: 'iron' }} className="btn btn-secondary btn-lg">{t('home.ctaFarm')}</Link>
          </div>
          <div className="hero-pop">
            <span className="t-small mute">{t('home.popular')}</span>
            {['netherite_ingot', 'elytra', 'shulker_box'].map((id) => (
              <Link key={id} to={{ page: 'item', id }} className="chip">{t(`item.${id}`)}</Link>
            ))}
          </div>
          {s && (
            <p className="hero-status t-small">
              <span className={`status ${s.accepting && !s.vacation.on ? '' : 'away'}`}><i aria-hidden="true" />{s.accepting && !s.vacation.on ? t('home.open') : t('home.closed')}</span>
              <span className="mute">·</span> <span>{t('home.waitNow', { n: publicWaitDays(db, s) })}</span>
              {ev && <><span className="mute">·</span> <Link to={{ page: 'shop' }} className="tlink">{t('shop.eventOn', { name: ev.name, x: ev.multiplier })}</Link></>}
            </p>
          )}
        </div>
        <div className="scene-tabs" role="radiogroup" aria-label={t('home.sceneLabel')}>
          {names.map((n, i) => (
            <button key={n} type="button" role="radio" aria-checked={i === scene} onClick={() => setScene(i)}><span className="sw" style={{ background: sw[i] }} aria-hidden="true" />{n}</button>
          ))}
        </div>
      </div>
          </section>
  );
}

function Facts() {
  const { t, db, items, lang } = useStore();
  const s = db.sellers[0];
  const farms = db.services.filter((x) => x.kind === 'farm' && x.active).length;
  return (
    <ul className="facts card plain wrap-inner">
      <li><span className="d-s num">{fmtN(items.length || 1537, lang)}</span><span className="t-small mute">{t('home.factItems')}</span></li>
      <li><span className="d-s num">{farms}</span><span className="t-small mute">{t('home.factFarms')}</span></li>
      <li><span className="d-s num">~{t('common.nDays', { n: s ? publicWaitDays(db, s) : 2 })}</span><span className="t-small mute">{t('home.factWait')}</span></li>
      <li><span className="d-s">{t('home.factPayTitle')}</span><span className="t-small mute">{t('home.factPay')}</span></li>
    </ul>
  );
}

function Categories() {
  const { t, items, lang, db } = useStore();
  const { setCat, setQ, setSet } = useSearch();
  const [ref, cls] = useReveal<HTMLUListElement>();
  const count = (c: ItemCat) => items.filter((it) => it.cat === c).length;
  const cats: { cat?: ItemCat; icon: keyof typeof ICONS; key: string; farm?: string }[] = [
    { cat: 'blocks', icon: 'cube', key: 'cat.blocks' }, { cat: 'materials', icon: 'ingot', key: 'cat.materials' },
    { cat: 'tools', icon: 'pick', key: 'cat.tools' }, { cat: 'armor', icon: 'kit', key: 'cat.armor' },
    { cat: 'food', icon: 'food', key: 'cat.food' }, { cat: 'redstone', icon: 'dust', key: 'cat.redstone' },
    { icon: 'iron', key: 'nav.farms', farm: 'iron' }, { icon: 'scroll', key: 'nav.custom', farm: 'custom' },
  ];
  return (
    <section className="wrap sec" aria-labelledby="h-cats">
      <div className="sec-head">
        <div><p className="t-label eyebrow ink2">{t('home.catsKicker')}</p><h2 className="d-m" id="h-cats">{t('home.catsTitle')}</h2></div>
        <Link to={{ page: 'items' }} className="tlink" onClick={() => { setCat('all'); setQ(''); setSet(''); }}>{t('home.allItems', { n: fmtN(items.length || 1537, lang) })} <Glyph name="arrow" size={14} /></Link>
      </div>
      <ul className={`cats plain rise ${cls}`} ref={ref}>
        {cats.map((c) => (
          <li key={c.key}>
            <Link to={c.farm ? { page: 'farm', id: c.farm } : { page: 'items' }} className="cat" onClick={() => { if (c.cat) { setCat(c.cat); setQ(''); setSet(''); } }}>
              <span className="cat-img"><PixelArt art={ICONS[c.icon]} size={64} /></span>
              <span className="cat-name">{t(c.key)}</span>
              <span className="t-small mute num">{c.cat ? t('home.nItems', { n: fmtN(count(c.cat), lang) }) : c.farm === 'custom' ? t('home.customMeta') : t('home.farmsMeta', { n: db.services.filter((x) => x.kind === 'farm' && x.active).length })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Worlds() {
  const { t, theme } = useStore();
  const { setSet, setQ, setCat } = useSearch();
  const [ref, cls] = useReveal<HTMLDivElement>();
  const farm = scenes.worldFarm();
  const list = [
    { cls: 'big', scene: farm, bg: sceneBg(farm, theme), kicker: t('world.farmKicker'), title: t('world.farmTitle'), body: t('world.farmBody'), cta: t('world.farmCta'), to: { page: 'farm', id: 'iron' } as const },
    { cls: '', scene: scenes.worldNether(), bg: '#2a0c10', kicker: t('world.netherKicker'), title: t('world.netherTitle'), body: t('world.netherBody'), cta: t('world.netherCta'), to: { page: 'items' } as const, set: 'nether' as const },
    { cls: '', scene: scenes.worldEnd(), bg: '#140f24', kicker: t('world.endKicker'), title: t('world.endTitle'), body: t('world.endBody'), cta: t('world.endCta'), to: { page: 'items' } as const, set: 'end' as const },
  ];
  return (
    <section className="wrap sec" aria-label={t('world.label')}>
      <div className={`worlds rise ${cls}`} ref={ref}>
        {list.map((w) => (
          <Link key={w.title} to={w.to} className={`world frame ${w.cls}`} style={{ background: w.bg }} onClick={() => { if (w.set) { setSet(w.set); setQ(''); setCat('all'); } }}>
            <SceneArt scene={w.scene} />
            <span className="world-tag">
              <span className="t-label mute">{w.kicker}</span>
              <span className="world-title">{w.title}</span>
              <span className="t-small ink2">{w.body}</span>
              <span className="world-go">{w.cta} <Glyph name="arrow" size={14} /></span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Services() {
  const { t, db, lang, theme } = useStore();
  const [ref, cls] = useReveal<HTMLUListElement>();
  const all = db.services.filter((x) => x.kind === 'farm' && x.active);
  const farms = all.filter((x) => farmDef(farmKey(x))?.popular).slice(0, 8);
  return (
    <section className="wrap sec" aria-labelledby="h-gigs">
      <div className="sec-head">
        <div><p className="t-label eyebrow ink2">{t('nav.farms')}</p><h2 className="d-m" id="h-gigs">{t('home.gigsTitle')}</h2></div>
        <Link to={{ page: 'farm', id: 'iron' }} className="tlink">{t('home.allFarmsN', { n: all.length })} <Glyph name="arrow" size={14} /></Link>
      </div>
      <ul className={`gigs plain rise ${cls}`} ref={ref}>
        {farms.map((svc, i) => {
          const key = farmKey(svc), sc = scenes.card(key);
          return (
            <li key={svc.id} style={{ ['--d' as string]: `${i * 40}ms` }}>
              <Link to={{ page: 'farm', id: key }} className="gig">
                <span className="gig-img frame" style={{ background: farmDef(key)?.scene === 'nether' ? '#2a0c10' : farmDef(key)?.scene === 'end' ? '#140f24' : sceneBg(sc, theme) }}>
                  <SceneArt scene={sc} />
                  <span className="gig-ic"><PixelArt art={ICONS[FARM_ICON[key] ?? 'iron']} size={36} /></span>
                </span>
                <span className="gig-body">
                  <span className="t-title gig-title">{svc.name[lang]}</span>
                  <span className="t-small ink2">{svc.description[lang]}</span>
                  <span className="gig-meta"><span className="badge b-line">{t('home.tierRange')}</span><span className="t-small mute">~{t('common.nDays', { n: FARM_DAYS(key) })}</span></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Popular() {
  const { t, items, addToCart, lang } = useStore();
  const [ref, cls] = useReveal<HTMLUListElement>();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const list = POPULAR.slice(0, 7).filter((id) => id !== 'diamond').slice(0, 6).map((id) => items.find((it) => it.id === id)).filter(Boolean);
  if (!list.length) return null;
  return (
    <section className="wrap sec" aria-labelledby="h-pop">
      <div className="sec-head">
        <div><p className="t-label eyebrow ink2">{t('home.popKicker')}</p><h2 className="d-m" id="h-pop">{t('home.popTitle')}</h2></div>
        <Link to={{ page: 'items' }} className="tlink">{t('home.toSearch')} <Glyph name="arrow" size={14} /></Link>
      </div>
      <ul className={`pops plain rise ${cls}`} ref={ref}>
        {list.map((it) => {
          const unit = defaultUnit(it!);
          return (
            <li key={it!.id} className="pop card">
              <span className="pop-img"><PixelArt art={iconFor(it!)} size={72} /></span>
              <span className="pop-body"><Link to={{ page: 'item', id: it!.id }} className="pop-name">{lang === 'de' ? it!.de : it!.en}</Link><span className="t-small mute">{it!.stack > 1 ? t('item.stackN', { n: it!.stack }) : t('item.unstackable')}</span></span>
              <button type="button" className={`btn btn-secondary btn-sm btn-block ${done[it!.id] ? 'done' : ''}`}
                aria-label={t('home.addAria', { unit: t(`unit.${unit}`), name: lang === 'de' ? it!.de : it!.en })}
                onClick={() => { addToCart(it!, 1, unit); setDone((d) => ({ ...d, [it!.id]: true })); window.setTimeout(() => setDone((d) => ({ ...d, [it!.id]: false })), 1600); }}>
                {done[it!.id] ? `✓ ${t('cart.inCart')}` : `+ 1 ${t(`unit.${unit}`)}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS: { key: string; icon: keyof typeof ICONS; who: 'you' | 'both' | 'me' }[] = [
  { key: 'pick', icon: 'scroll', who: 'you' },
  { key: 'terms', icon: 'emerald', who: 'both' },
  { key: 'build', icon: 'pick', who: 'me' },
  { key: 'done', icon: 'heart', who: 'you' },
];
function Flow() {
  const { t } = useStore();
  return (
    <section id="ablauf" className="wrap sec" aria-labelledby="h-flow">
      <div className="sec-head">
        <div><p className="t-label eyebrow ink2">{t('nav.how')}</p><h2 className="d-m" id="h-flow" style={{ maxWidth: '26ch' }}>{t('home.flowTitle')}</h2></div>
        <Link to={{ page: 'terms' }} className="tlink">{t('rules.all')} <Glyph name="arrow" size={14} /></Link>
      </div>
      <ol className="steps plain">
        {STEPS.map((s, i) => (
          <li key={s.key} className="step card">
            <span className="step-top">
              <span className="step-n num" aria-hidden="true">{i + 1}</span>
              <span className={`badge ${s.who === 'me' ? 'b-ink' : s.who === 'both' ? 'b-info' : 'b-line'}`}>{t(`flow.who.${s.who}`)}</span>
              <span className="step-ic" aria-hidden="true"><PixelArt art={ICONS[s.icon] ?? ICONS.cube} size={32} /></span>
            </span>
            <span className="t-title">{t(`flow.${s.key}.h`)}</span>
            <span className="t-small ink2">{t(`flow.${s.key}.b`, { n: CONFIG.approvalWindowDays })}</span>
            <span className="t-small mute step-see">{t(`flow.${s.key}.see`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const RULES = ['price', 'pay', 'slots', 'cancel', 'check', 'site', 'fair', 'block'];

function About() {
  const { t, db, lang } = useStore();
  const s = db.sellers[0];
  const st = s ? sellerStats(db, s.id) : null;
  const stickers: [keyof typeof ICONS, number, React.CSSProperties][] = [['heart', -10, { right: -22, top: 40 }], ['pick', 12, { left: -24, top: '46%' }], ['pearl', -6, { right: 18, bottom: -22 }]];
  return (
    <section id="ueber-mich" className="sec" aria-labelledby="h-me">
      <div className="birch-band">
        <div className="wrap me-grid">
          <div className="me-photo" aria-hidden="true">
            <PixelArt art={PORTRAIT} vb="0 0 8 8" className="me-face" />
            {stickers.map(([ic, r, pos], i) => <Sticker key={ic} icon={ic} rot={r} pos={pos} delay={80 + i * 90} />)}
            <span className="badge b-slime" style={{ position: 'absolute', left: 16, bottom: 16 }}>{t('home.meBadge')}</span>
          </div>
          <div className="me-text">
            <p className="t-label eyebrow ink2">{t('home.meKicker')}</p>
            <h2 className="d-l mc" id="h-me">{s?.displayName ?? 'Stackr'}</h2>
            <p className="t-lead">{s?.tagline[lang]} {t('home.meBody')}</p>
            {st && (
              <dl className="me-facts">
                <div><dt className="t-label mute">{t('home.meReply')}</dt><dd>{t('home.meReplyV')}</dd></div>
                <div><dt className="t-label mute">{t('stats.completed')}</dt><dd className="num">{st.completed}</dd></div>
                <div><dt className="t-label mute">{t('stats.onTime')}</dt><dd className="num">{st.onTimeRate === null ? '—' : `${Math.round(st.onTimeRate * 100)} %`}</dd></div>
                <div><dt className="t-label mute">{t('stats.rating')}</dt><dd className="num">{st.avgStars === null ? '—' : `★ ${st.avgStars.toFixed(1).replace('.', lang === 'de' ? ',' : '.')} · ${st.ratedCount}`}</dd></div>
              </dl>
            )}
            <div className="hero-cta">
              <Link to={{ page: 'farm', id: 'custom' }} className="btn btn-primary"><Glyph name="chat" /> {t('home.meWrite')}</Link>
              <Link to={{ page: 'farm', id: 'iron' }} className="btn btn-secondary">{t('home.meFarms')}</Link>
            </div>
          </div>
          <section id="regeln" className="rules-card card" aria-labelledby="h-rules">
            <h3 className="t-title" id="h-rules">{t('rules.title')}</h3>
            <ol className="rules">
              {RULES.map((k) => <li key={k}><b>{t(`rules.${k}.h`, { n: CONFIG.maxOpenOrdersPerClient, d: CONFIG.approvalWindowDays })}</b> <span className="ink2">{t(`rules.${k}.b`, { n: CONFIG.maxOpenOrdersPerClient, d: CONFIG.approvalWindowDays })}</span></li>)}
            </ol>
            <Link to={{ page: 'terms' }} className="tlink">{t('rules.all')} <Glyph name="arrow" size={14} /></Link>
          </section>
        </div>
      </div>
    </section>
  );
}

function Sticker({ icon, rot, pos, delay }: { icon: keyof typeof ICONS; rot: number; pos: React.CSSProperties; delay: number }) {
  const [ref, cls] = useReveal<HTMLSpanElement>(false);
  return <span ref={ref} className={`sticker float ${cls}`} style={{ ...pos, ['--r' as string]: `${rot}deg`, ['--d' as string]: `${delay}ms` }}><PixelArt art={ICONS[icon]} size={56} /></span>;
}

function Statement() {
  const { t } = useStore();
  const [ref, cls] = useReveal<HTMLHeadingElement>();
  const floaters: (keyof typeof ICONS)[] = ['kit', 'pearl', 'wool', 'heart', 'diamond'];
  return (
    <section className="statement dark" aria-labelledby="h-why">
      <div className="wrap statement-in">
        <span className="badge b-slime">{t('home.whyBadge')}</span>
        <h2 id="h-why" ref={ref} className={`statement-text rise ${cls}`}>{t('home.whyA')} <span className="px-word">{t('home.whyB')}</span></h2>
        <p className="t-lead statement-body">{t('home.whyBody')}</p>
        <div className="hero-cta">
          <Link to={{ page: 'farm', id: 'custom' }} className="btn btn-slime btn-lg">{t('home.meWrite')} <Glyph name="arrow" size={14} /></Link>
          <Link to={{ page: 'shop' }} className="btn btn-secondary btn-lg">{t('nav.shop')}</Link>
        </div>
        <div className="floaters" aria-hidden="true">
          {floaters.map((ic, i) => <Floater key={ic} icon={ic} rot={[-8, 6, -3, 10, -5][i]} delay={i * 70} />)}
        </div>
      </div>
    </section>
  );
}
function Floater({ icon, rot, delay }: { icon: keyof typeof ICONS; rot: number; delay: number }) {
  const [ref, cls] = useReveal<HTMLSpanElement>(false);
  return <span ref={ref} className={`floater float ${cls}`} style={{ ['--r' as string]: `${rot}deg`, ['--d' as string]: `${delay}ms` }}><PixelArt art={ICONS[icon]} size={64} /></span>;
}

export function HomePage() {
  const { route } = useRouter();
  void route;
  return (
    <>
      <Hero />
      <section className="wrap" style={{ marginTop: 16 }}><Facts /></section>
      <Categories />
      <Worlds />
      <Services />
      <Popular />
      <Flow />
      <About />
      <Statement />
    </>
  );
}
