import React, { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Link, useRouter } from '../ui/router';
import { Glyph, ICONS, PORTRAIT, PixelArt, SceneArt, sceneBg, scenes } from '../ui/Pixel';
import { ErrorLine, Field, Stars, TokenPill, fmtDate } from '../ui/components';
import { FARM_ICON, farmKey } from './Home';
import { checkCanOrder, clientStats, sellerStats, unusedTokens } from '../domain/rules';
import type { Coords, FarmTier, Service, Token, TokenType } from '../domain/types';

const TIER_INFO: Record<FarmTier, { days: number; badge: string; incl: string[] }> = {
  1: { days: 2, badge: 'b-line', incl: ['farm.incl.small', 'farm.incl.coords', 'farm.incl.test', 'farm.incl.chest'] },
  2: { days: 3, badge: 'b-info', incl: ['farm.incl.mid', 'farm.incl.coords', 'farm.incl.test', 'farm.incl.double'] },
  3: { days: 5, badge: 'b-slime', incl: ['farm.incl.big', 'farm.incl.coords', 'farm.incl.test', 'farm.incl.room'] },
};
const CMP: [string, string[]][] = [
  ['farm.cmp.size', ['farm.cmp.small', 'farm.cmp.mid', 'farm.cmp.big']],
  ['farm.cmp.storage', ['farm.cmp.chest', 'farm.cmp.double', 'farm.cmp.room']],
  ['farm.cmp.sorting', ['farm.cmp.extra', 'farm.cmp.extra', 'farm.cmp.incl']],
  ['farm.cmp.test', ['common.yes', 'common.yes', 'common.yes']],
  ['farm.cmp.days', ['~2', '~3', '~5']],
  ['farm.cmp.level', ['farm.cmp.lv1', 'farm.cmp.lv2', 'farm.cmp.lv3']],
];

/** The request form: coordinates, offer, tokens, rules. Used by farms and custom requests. */
function RequestForm({ svc, tier, extras, own, token, onTokenChange }: {
  svc: Service; tier?: FarmTier; extras: string[]; own: boolean; token: boolean; onTokenChange?: (on: boolean) => void;
}) {
  const { t, db, me, now, lang, runForId, showToast } = useStore();
  const { go } = useRouter();
  const seller = db.sellers.find((s) => s.id === svc.sellerId)!;
  const isFarm = svc.kind === 'farm';
  const [coords, setCoords] = useState<{ x: string; y: string; z: string; dimension: Coords['dimension'] }>({ x: '', y: '', z: '', dimension: svc.id.endsWith('gold') ? 'nether' : 'overworld' });
  const [offer, setOffer] = useState('');
  const [details, setDetails] = useState('');
  const [title, setTitle] = useState('');
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [tos, setTos] = useState(false);
  const [vacAck, setVacAck] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myTokens = useMemo(() => (me ? unusedTokens(db, me.id) : []), [db, me]);
  if (!me) {
    return (
      <div className="stack-sm">
        <p className="t-small ink2">{t('checkout.signInFirst')}</p>
        <Link to={{ page: 'signin' }} className="btn btn-primary btn-lg btn-block">{t('checkout.signIn')} <Glyph name="arrow" size={14} /></Link>
      </div>
    );
  }
  const highEffort = myTokens.find((x) => x.type === 'high_effort');
  const ids = [...tokenIds, ...(token && highEffort && !tokenIds.includes(highEffort.id) ? [highEffort.id] : [])];
  const chosen = ids.map((id) => myTokens.find((x) => x.id === id)).filter(Boolean) as Token[];
  const has = (type: TokenType) => chosen.some((x) => x.type === type);
  const check = checkCanOrder(db, seller, me.id, now, has('extra_slot'));
  const num = (v: string) => (v.trim() === '' || v.trim() === '-' ? NaN : Number(v));
  const c = { x: num(coords.x), y: num(coords.y), z: num(coords.z) };
  const coordsOk = [c.x, c.y, c.z].every(Number.isFinite);
  const needCoords = isFarm;
  const titleOk = isFarm || title.trim().length > 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTried(true);
    if ((needCoords && !coordsOk) || !tos || !titleOk || (seller.vacation.on && !vacAck)) return;
    if (busy) return;
    setBusy(true);
    const { error: r, id } = await runForId({ type: 'placeOrder', input: {
      serviceId: svc.id, title: isFarm ? svc.name[lang] : title, details, batches: 1,
      farmTier: isFarm ? tier : undefined, extras, coords: coordsOk ? { ...c, dimension: coords.dimension } : undefined,
      deliveryMethod: isFarm ? 'build_at_coords' : 'hand_over', clientProvidesMaterials: own, offer, tokenIds: ids,
      tosAccepted: tos, vacationAcknowledged: vacAck,
    } });
    setBusy(false);
    if (r || !id) { setErr(r); return; }
    showToast(t('order.placed'));
    go({ page: 'order', id });
  };
  const coordErr = tried && needCoords && !coordsOk;
  return (
    <form className="stack-sm" onSubmit={submit} noValidate>
      {!check.ok && <div className="notice bad">{check.reasons.map((r) => <p key={r}>{t(r)}</p>)}</div>}
      {!isFarm && (
        <Field label={t('custom.what')} htmlFor="r-title" error={tried && !titleOk ? t('err.titleRequired') : null}>
          <input className="field" id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t('custom.whatPh')} aria-invalid={tried && !titleOk} />
        </Field>
      )}
      <fieldset className="coords">
        <legend>{isFarm ? t('order.f.coordsFarm') : t('custom.coordsOptional')}</legend>
        <div className="xyz">
          {(['x', 'y', 'z'] as const).map((k) => (
            <input key={k} className="field num" inputMode="numeric" aria-label={k.toUpperCase()} placeholder={k.toUpperCase()} value={coords[k]} aria-invalid={coordErr}
              onChange={(e) => setCoords({ ...coords, [k]: e.target.value.replace(/[^\d-]/g, '') })} />
          ))}
          <select className="field" aria-label={t('order.f.dimension')} value={coords.dimension} onChange={(e) => setCoords({ ...coords, dimension: e.target.value as Coords['dimension'] })}>
            <option value="overworld">{t('dim.overworld')}</option><option value="nether">{t('dim.nether')}</option><option value="end">{t('dim.end')}</option>
          </select>
        </div>
        {coordErr && <p className="err"><Glyph name="info" size={12} /> {t('err.coordsRequired')}</p>}
      </fieldset>
      <Field label={isFarm ? t('order.f.details') : t('order.f.detailsCustom')} htmlFor="r-details">
        <textarea className="field" id="r-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1500} placeholder={isFarm ? t('farm.detailsPh') : t('custom.detailsPh')} />
      </Field>
      <Field label={t('order.f.offer')} htmlFor="r-offer" hint={t('order.f.offerHint')}>
        <input className="field" id="r-offer" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={200} placeholder={t('order.f.offerPlaceholder')} />
      </Field>
      {myTokens.filter((x) => x.type !== 'high_effort').length > 0 && (
        <fieldset className="coords"><legend>{t('order.f.tokens')}</legend>
          {myTokens.filter((x) => x.type !== 'high_effort').map((tok) => (
            <label key={tok.id} className="check"><input type="checkbox" checked={tokenIds.includes(tok.id)} onChange={() => setTokenIds((xs) => xs.includes(tok.id) ? xs.filter((i) => i !== tok.id) : [...xs.filter((i) => myTokens.find((m) => m.id === i)?.type !== tok.type), tok.id])} />
              <span><TokenPill token={tok} /> <span className="t-small ink2">{t(`token.desc.${tok.type}`)}</span></span></label>
          ))}
        </fieldset>
      )}
      {seller.vacation.on && (
        <label className="check"><input type="checkbox" checked={vacAck} onChange={(e) => setVacAck(e.target.checked)} />
          <span>{t('order.f.vacationAck', { seller: seller.displayName, date: fmtDate(seller.lastOnlineAt, lang) })}</span></label>
      )}
      <label className="check"><input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} aria-invalid={tried && !tos} />
        <span>{t('checkout.tos')} <Link to={{ page: 'terms' }}>{t('nav.terms')}</Link>.</span></label>
      {tried && !tos && <p className="err" style={{ marginTop: -6 }}><Glyph name="info" size={12} /> {t('err.tos')}</p>}
      <ErrorLine msg={err} />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!check.ok || busy} aria-busy={busy}>{t('farm.send')} <Glyph name="arrow" size={14} /></button>
      {onTokenChange && null}
    </form>
  );
}

export function FarmPage({ id }: { id: string }) {
  const { t, db, me, lang, theme } = useStore();
  const { go } = useRouter();
  const farms = db.services.filter((s) => s.kind === 'farm' && s.active);
  const custom = db.services.find((s) => s.kind === 'custom' && s.active);
  const svc = id === 'custom' ? custom : farms.find((s) => farmKey(s) === id) ?? farms[0];
  const key = svc ? farmKey(svc) : 'custom';
  const [img, setImg] = useState(0);
  const [tier, setTier] = useState<FarmTier>(1);
  const [token, setToken] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [own, setOwn] = useState(false);
  const [asking, setAsking] = useState(false);
  const seller = db.sellers[0];
  const myLevel = me ? clientStats(db, me.id).maxFarmTier : 1;
  const myHighEffort = me ? unusedTokens(db, me.id).filter((x) => x.type === 'high_effort').length : 0;
  const st = seller ? sellerStats(db, seller.id) : null;
  if (!svc || !seller) return <div className="wrap shop"><p>{t('err.serviceMissing')}</p></div>;
  const isFarm = svc.kind === 'farm';
  const locked = isFarm && tier > myLevel;
  const blocked = locked && !(token && myHighEffort > 0);
  const tierLabel = svc.tiers?.find((x) => x.tier === tier)?.label[lang] ?? '';
  const nether = key === 'gold';
  const pics = isFarm ? [0, 1, 2].map((i) => scenes.farm(key, i)) : [];
  const bg = (sc: (typeof pics)[number]) => (nether ? '#2a0c10' : sceneBg(sc, theme));
  const reviews = db.orders.filter((o) => o.sellerId === seller.id && o.rating).slice(-3).reverse();

  return (
    <div className="wrap gig-page">
      <nav className="crumbs" aria-label={t('nav.path')}><Link to={{ page: 'home' }}>{t('nav.home')}</Link><span aria-hidden="true">/</span><Link to={{ page: 'farm', id: 'iron' }}>{t('nav.farms')}</Link><span aria-hidden="true">/</span><span aria-current="page">{svc.name[lang]}</span></nav>
      <div className="scroller ftabs" role="tablist" aria-label={t('farm.pick')}>
        {[...farms, ...(custom ? [custom] : [])].map((f) => {
          const k = f.kind === 'custom' ? 'custom' : farmKey(f);
          return (
            <button key={f.id} className="ftab" type="button" role="tab" aria-selected={f.id === svc.id} onClick={() => { setImg(0); setAsking(false); go({ page: 'farm', id: k }); }}>
              <PixelArt art={ICONS[k === 'custom' ? 'scroll' : FARM_ICON[k] ?? 'iron']} size={24} />{f.name[lang]}
            </button>
          );
        })}
      </div>

      <div className="gig-grid">
        <div className="gig-main" key={svc.id}>
          <h1 className="d-m">{isFarm ? t('farm.title', { name: svc.name[lang] }) : t('custom.title')}</h1>
          <div className="seller">
            <span className="avatar" aria-hidden="true"><PixelArt art={PORTRAIT} vb="0 0 8 8" size={32} /></span>
            <span className="t-small"><b className="mc">{seller.displayName}</b> · {t('home.meReplyV')}</span>
            {st && st.ratedCount > 0 && <a className="t-small ink2" href="#bewertungen" onClick={(e) => { e.preventDefault(); document.getElementById('bewertungen')?.scrollIntoView(); }}>★ {st.avgStars?.toFixed(1)} · {t(st.ratedCount === 1 ? 'farm.oneReview' : 'farm.nReviews', { n: st.ratedCount })}</a>}
          </div>

          {isFarm ? (
            <>
              <div className="gal-wrap">
                <div className="gal frame" style={{ background: bg(pics[img]) }}>
                  <SceneArt scene={pics[img]} label={t('farm.picAlt', { name: svc.name[lang], n: img + 1 })} />
                  <span className="badge b-ink gal-no num">{t('farm.picNo', { n: img + 1 })}</span>
                </div>
                <div className="thumbs" role="group" aria-label={t('farm.pics')}>
                  {pics.map((sc, i) => (
                    <button key={i} className="thumb frame" type="button" aria-label={t('farm.showPic', { n: i + 1 })} aria-pressed={i === img} onClick={() => setImg(i)} style={{ background: bg(sc) }}><SceneArt scene={sc} /></button>
                  ))}
                </div>
              </div>
              <section className="block" aria-labelledby="h-about">
                <h2 className="t-title" id="h-about">{t('farm.about')}</h2>
                <p className="t-lead">{svc.description[lang]}</p>
                <p className="t-body ink2">{t('farm.aboutBody')}</p>
              </section>
              <section className="block" aria-labelledby="h-cmp">
                <h2 className="t-title" id="h-cmp">{t('farm.cmpTitle')}</h2>
                <div className="cmp-wrap card">
                  <table className="cmp">
                    <thead><tr><th scope="col"><span className="sr">{t('farm.cmp.feature')}</span></th>{svc.tiers!.map((x) => <th key={x.tier} scope="col" className={x.tier === tier ? 'on' : ''}>{x.label[lang]}</th>)}</tr></thead>
                    <tbody>{CMP.map(([label, cells]) => <tr key={label}><th scope="row">{t(label)}</th>{cells.map((v, i) => <td key={i} className={i + 1 === tier ? 'on' : ''}>{v.startsWith('~') ? `${v} ${t('common.days')}` : t(v)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="block custom-intro" aria-labelledby="h-custom">
              <h2 className="t-title" id="h-custom">{t('custom.introTitle')}</h2>
              <p className="t-lead">{t('custom.intro')}</p>
              <p className="t-body ink2">{t('custom.introNote')}</p>
            </section>
          )}

          <section className="block" aria-labelledby="h-faq">
            <h2 className="t-title" id="h-faq">{t('faq.title')}</h2>
            <div className="faqs">{['material', 'done', 'broken', 'tier'].map((k) => <details key={k} className="faq"><summary>{t(`faq.${k}.q`)}</summary><p>{t(`faq.${k}.a`)}</p></details>)}</div>
          </section>

          <section id="bewertungen" className="block" aria-labelledby="h-rev">
            <h2 className="t-title" id="h-rev">{t('farm.reviews')} {st && st.ratedCount > 0 && <span className="t-small mute">★ {st.avgStars?.toFixed(1)} · {t(st.ratedCount === 1 ? 'farm.oneReview' : 'farm.nReviews', { n: st.ratedCount })}</span>}</h2>
            {reviews.length === 0 ? <p className="t-body ink2">{t('farm.noReviews')}</p> : reviews.map((o) => {
              const c = db.accounts.find((a) => a.id === o.clientId);
              return (
                <article key={o.id} className="review card">
                  <div className="review-top"><span className="avatar a2" aria-hidden="true">{c?.mcName.slice(0, 2).toUpperCase()}</span><div><b className="mc">{c?.mcName}</b><p className="t-small mute">{o.title} · {fmtDate(o.rating!.at, lang, false)}</p></div><span className="stars-r"><Stars value={o.rating!.stars} /></span></div>
                  {Object.keys(o.rating!.tags).length > 0 && <dl className="review-sub">{Object.entries(o.rating!.tags).map(([k, v]) => <div key={k}><dt>{t(`rating.tag.${k}`)}</dt><dd>{v} / 5</dd></div>)}</dl>}
                </article>
              );
            })}
            <p className="t-small mute">{t('farm.reviewNote')}</p>
          </section>
        </div>

        <aside className="pkg card" aria-label={t('farm.pkg')}>
          {isFarm && svc.tiers ? (
            <>
              <div className="ptabs" role="tablist" aria-label={t('farm.tier')}>
                {svc.tiers.map((x) => (
                  <button key={x.tier} className="ptab" type="button" role="tab" id={`tab-t${x.tier}`} aria-selected={x.tier === tier} aria-controls="tier-panel" onClick={() => { setTier(x.tier); setAsking(false); }}>
                    {x.label[lang]}{x.tier > myLevel && <><Glyph name="lock" size={10} /><span className="sr"> {t('farm.locked')}</span></>}
                  </button>
                ))}
              </div>
              <div className="pkg-body" id="tier-panel" role="tabpanel" aria-labelledby={`tab-t${tier}`}>
                <div className="pkg-title"><span className="d-s">{tierLabel}</span><span className={`badge ${TIER_INFO[tier].badge}`}>{t('farm.tierN', { n: tier })}</span></div>
                <p className="t-body ink2">{t(`farm.tierDesc.${tier}`)}</p>
                <ul className="incl plain">{TIER_INFO[tier].incl.map((k) => <li key={k}><Glyph name="check" size={12} color="var(--ok)" /><span>{t(k)}</span></li>)}</ul>
                <fieldset className="extras"><legend className="t-label mute">{t('order.f.extras')}</legend>
                  {svc.extras?.map((x) => <label key={x.id} className="check"><input type="checkbox" checked={extras.includes(x.id)} onChange={(e) => setExtras((xs) => e.target.checked ? [...xs, x.id] : xs.filter((i) => i !== x.id))} />{x.name[lang]}</label>)}
                  <label className="check"><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />{t('order.f.ownMaterials')}</label>
                </fieldset>
                {locked && (
                  <div className="lockbox">
                    <p className="t-small"><b>{t('farm.lockTitle', { name: tierLabel, n: tier })}</b> {t('farm.lockText', { n: myLevel })}</p>
                    {myHighEffort > 0
                      ? <label className="check"><input type="checkbox" checked={token} onChange={(e) => setToken(e.target.checked)} /><span><span className="badge b-slime" style={{ marginRight: 6 }}>{t('token.high_effort')}</span>{t('farm.useToken', { n: myHighEffort })}</span></label>
                      : <p className="t-small ink2" style={{ margin: '8px 0' }}>{t('farm.noToken')}</p>}
                  </div>
                )}
                <div className="pkg-price"><span className="t-label mute">{t('farm.price')}</span><span className="t-body"><b>{t('farm.priceOffer')}</b>{t('farm.priceRest', { n: TIER_INFO[tier].days })}</span></div>
                {asking && !blocked ? (
                  <RequestForm svc={svc} tier={tier} extras={extras} own={own} token={token} />
                ) : (
                  <>
                    <button className="btn btn-primary btn-lg btn-block" type="button" disabled={blocked} aria-describedby={blocked ? 'why-off' : undefined} onClick={() => setAsking(true)}>{blocked ? t('farm.ctaLocked', { name: tierLabel }) : t('farm.cta', { name: tierLabel })}</button>
                    {blocked && <p className="t-small ink2 why" id="why-off"><Glyph name="info" size={12} /><span>{myHighEffort > 0 ? t('farm.whyToken', { name: tierLabel }) : t('farm.whyLevel', { n: tier })}</span></p>}
                  </>
                )}
                <Link to={{ page: 'farm', id: 'custom' }} className="btn btn-secondary btn-block"><Glyph name="chat" size={14} /> {t('farm.ask')}</Link>
              </div>
            </>
          ) : (
            <div className="pkg-body">
              <div className="pkg-title"><span className="d-s">{t('custom.title')}</span></div>
              <p className="t-body ink2">{t('custom.reply')}</p>
              <RequestForm svc={svc} extras={[]} own={false} token={false} />
            </div>
          )}
        </aside>
      </div>
      {isFarm && (
        <div className="gbar"><span className="t-small"><b>{svc.name[lang]} · {tierLabel}</b> · {t('farm.priceOffer')}</span>
          <button className="btn btn-primary btn-sm" type="button" disabled={blocked} onClick={() => { setAsking(true); document.querySelector('.pkg')?.scrollIntoView({ block: 'start' }); }}>{blocked ? t('farm.lockedShort') : t('farm.ctaShort')}</button></div>
      )}
    </div>
  );
}
