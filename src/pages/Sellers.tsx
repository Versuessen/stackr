import React from 'react';
import { useStore } from '../data/store';
import { Link } from '../ui/router';
import { Empty, Stars, fmtDate } from '../ui/components';
import { bulkLimit, clientStats, publicWaitDays, sellerStats } from '../domain/rules';
import type { SellerProfile, Service } from '../domain/types';

function Availability({ s }: { s: SellerProfile }) {
  const { t, db, lang } = useStore();
  if (!s.accepting) return <span className="chip chip-cancelled">{t('seller.closed')}</span>;
  if (s.vacation.on) return <span className="chip chip-delivered">{t('seller.vacation', { date: fmtDate(s.lastOnlineAt, lang, false) })}</span>;
  return <span className="chip chip-completed">{t('seller.waitAbout', { n: publicWaitDays(db, s) })}</span>;
}

export function SellersPage() {
  const { t, db, lang } = useStore();
  return (
    <section className="stack">
      <div className="page-head">
        <h1>{t('home.title')}</h1>
        <p className="lead">{t('home.lead')}</p>
      </div>
      {db.sellers.length === 0 && <Empty>{t('home.none')}</Empty>}
      <div className="seller-grid">
        {db.sellers.map((s) => {
          const st = sellerStats(db, s.id);
          return (
            <Link key={s.id} to={{ page: 'seller', id: s.id }} className="card seller-card">
              <div className="seller-card-head">
                <span className="avatar" aria-hidden="true">{s.displayName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="seller-name mc">{s.displayName}</div>
                  <div className="muted small">{t(`level.seller.${s.levelState.level}`)}</div>
                </div>
              </div>
              <p className="seller-tagline">{s.tagline[lang]}</p>
              <div className="seller-card-foot">
                <span><Stars value={st.avgStars} size="sm" /> <span className="muted small">({st.ratedCount})</span></span>
                <span className="small">{t('seller.completedN', { n: st.completed })}</span>
                <Availability s={s} />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="muted small">{t('home.moreSellers')}</p>
    </section>
  );
}

function pct(v: number | null) { return v === null ? '—' : `${Math.round(v * 100)} %`; }

export function SellerPage({ id }: { id: string }) {
  const { t, db, lang, me } = useStore();
  const s = db.sellers.find((x) => x.id === id);
  if (!s) return <Empty>{t('err.sellerMissing')}</Empty>;
  const st = sellerStats(db, s.id);
  const services = db.services.filter((x) => x.sellerId === s.id && x.active);
  const groups: { kind: Service['kind']; items: Service[] }[] = (['material', 'farm', 'custom'] as const)
    .map((kind) => ({ kind, items: services.filter((x) => x.kind === kind) })).filter((g) => g.items.length);
  const limit = bulkLimit(s.levelState.level);
  const myTier = me ? clientStats(db, me.id).maxFarmTier : 1;

  return (
    <section className="stack">
      <Link to={{ page: 'home' }} className="back">← {t('nav.sellers')}</Link>
      <div className="card profile">
        <div className="profile-id">
          <span className="avatar lg" aria-hidden="true">{s.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <h1 className="mc">{s.displayName}</h1>
            <p className="muted">{s.tagline[lang]}</p>
            <div className="row wrap-row"><span className="level-pill">{t(`level.seller.${s.levelState.level}`)}</span><Availability s={s} /></div>
          </div>
        </div>
        <dl className="stats">
          <div><dt>{t('stats.rating')}</dt><dd><Stars value={st.avgStars} /> <span className="muted small">{st.avgStars?.toFixed(1) ?? '—'} · {st.ratedCount}</span></dd></div>
          <div><dt>{t('stats.completed')}</dt><dd className="num">{st.completed}</dd></div>
          <div><dt>{t('stats.onTime')}</dt><dd className="num">{pct(st.onTimeRate)}</dd></div>
          <div><dt>{t('stats.points')}</dt><dd className="num">{st.points}</dd></div>
        </dl>
        <div className="tag-stars">
          {(['speed', 'quality', 'communication', 'accuracy'] as const).map((k) => (
            <div key={k} className="tag-star"><span>{t(`rating.tag.${k}`)}</span><Stars value={st.tags[k]} size="sm" /></div>
          ))}
        </div>
        {s.vacation.on && <p className="notice warn">{t('seller.vacationLong', { date: fmtDate(s.lastOnlineAt, lang) })}</p>}
      </div>

      {groups.map((g) => (
        <div key={g.kind} className="stack-sm">
          <h2>{t(`kind.${g.kind}`)}</h2>
          {g.kind === 'material' && <p className="muted small">{limit === null ? t('seller.noBulkLimit') : t('seller.bulkLimit', { n: limit })}</p>}
          {g.kind === 'farm' && <p className="muted small">{t('seller.tierInfo', { n: myTier })}</p>}
          <div className="service-list">
            {g.items.map((svc) => (
              <div key={svc.id} className="service">
                <div className="service-text">
                  <div className="service-name">{svc.name[lang]}</div>
                  <div className="muted small">{svc.description[lang]}</div>
                  {svc.tiers && <div className="tiers">{svc.tiers.map((x) => <span key={x.tier} className={`tier ${x.tier > myTier ? 'locked' : ''}`}>T{x.tier} · {x.label[lang]}</span>)}</div>}
                </div>
                <Link to={me ? { page: 'new', id: svc.id } : { page: 'signin' }} className="btn">{t('seller.order')}</Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
