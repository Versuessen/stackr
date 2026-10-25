import React, { useRef, useState } from 'react';
import type { Account, Order, OrderStatus, Token } from '../domain/types';
import { TRACK, trackIndex } from '../domain/rules';
import { useStore } from '../data/store';
import { Glyph } from './Pixel';

export function fmtDate(iso: string | undefined, lang: string, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtShort(iso: string | undefined, lang: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export const fmtN = (n: number, lang: string) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');

export function relDays(targetIso: string, now: number, t: ReturnType<typeof useStore>['t']) {
  const days = (Date.parse(targetIso) - now) / 864e5;
  if (days >= 1) return t('time.inDays', { n: Math.ceil(days) });
  if (days > 0) return t('time.inHours', { n: Math.max(1, Math.ceil(days * 24)) });
  if (days > -1) return t('time.hoursAgo', { n: Math.max(1, Math.floor(-days * 24)) });
  return t('time.daysAgo', { n: Math.floor(-days) });
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'b-warn', cleared: 'b-info', processing: 'b-info', fulfilling: 'b-info', delivered: 'b-warn', completed: 'b-ok', cancelled: 'b-bad', declined: 'b-bad',
};
export function StatusChip({ status, perspective = 'client' }: { status: OrderStatus; perspective?: 'client' | 'seller' }) {
  const { t } = useStore();
  const key = perspective === 'seller' && status === 'received' ? 'status.short.needsReply' : `status.short.${status}`;
  return <span className={`badge ${STATUS_BADGE[status]}`}>{t(key)}</span>;
}

const BLOCK_COLORS = ['#c9ced4', '#a7adb5', '#8b8f97', '#4fd8d0', '#2bb39b', 'var(--lapis)', 'var(--slime)'];

/** The seven-block stack tracker. Full stack = the order is yours. */
export function Tracker({ order, compact = false }: { order: Order; compact?: boolean }) {
  const { t, lang } = useStore();
  const idx = trackIndex(order);
  const stopped = order.status === 'cancelled' || order.status === 'declined';
  const timeOf = (step: string) => {
    const s = step === 'review' ? 'delivered' : step;
    return order.history.find((h) => h.status === s)?.at;
  };
  const stateOf = (i: number) => (order.status === 'completed' || i < idx ? 'done' : i === idx ? (stopped ? 'stopped' : 'now') : 'todo');
  const text = stopped
    ? t(`status.long.${order.status}`)
    : t('track.progress', { n: idx + 1, name: t(`track.${TRACK[idx]}`) }) + (idx < 6 ? ` · ${t('track.next', { name: t(`track.${TRACK[idx + 1]}`) })}` : '');
  if (compact) {
    return (
      <span className="mini-trk" role="img" aria-label={text}>
        {TRACK.map((s, i) => <i key={s} className={stateOf(i)} style={{ ['--c' as string]: BLOCK_COLORS[i] }} />)}
      </span>
    );
  }
  return (
    <div className="tracker card">
      <div className="trk-blocks" role="progressbar" aria-label={t('track.label')} aria-valuemin={1} aria-valuemax={7} aria-valuenow={idx + 1} aria-valuetext={text}>
        {TRACK.map((s, i) => {
          const at = i <= idx ? timeOf(s) : undefined;
          return (
            <div key={s} className={`trk ${stateOf(i)}`}>
              <span className="trk-block" style={{ ['--c' as string]: BLOCK_COLORS[i] }} aria-hidden="true"><i /></span>
              <span className="t-label mute num">0{i + 1}</span>
              <span className="trk-name">{t(`track.${s}`)}</span>
              <span className="t-small mute num">{at ? fmtShort(at, lang) : ''}</span>
            </div>
          );
        })}
      </div>
      <p className={`t-small trk-now ${stopped ? 'bad' : 'ink2'}`} aria-hidden="true">{text}</p>
    </div>
  );
}

export function Stars({ value, max = 5 }: { value: number | null; max?: number }) {
  const v = value ?? 0;
  return (
    <span className="stars" role="img" aria-label={value === null ? '—' : `${v.toFixed(1)} / ${max}`}>
      {Array.from({ length: max }, (_, i) => <Glyph key={i} name="star" size={14} color={i < Math.round(v) ? 'var(--lapis-ink)' : 'var(--faint)'} />)}
    </span>
  );
}

/** Radio group of pixel stars: arrow keys change it, clicking the same star again clears it. */
export function StarInput({ id, value, onChange, label, size = 36 }: { id: string; value: number; onChange: (n: number) => void; label: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (n: number) => { onChange(n); window.setTimeout(() => (ref.current?.children[n - 1] as HTMLElement | undefined)?.focus(), 0); };
  return (
    <div className="stars-in" role="radiogroup" aria-label={label} id={id} ref={ref}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} / 5`} tabIndex={(value || 1) === n ? 0 : -1}
          onClick={() => onChange(value === n ? 0 : n)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); move(Math.min(5, (value || 0) + 1)); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); move(Math.max(1, (value || 1) - 1)); }
          }}>
          <Glyph name="star" size={size} color={n <= value ? 'var(--lapis-ink)' : 'var(--faint)'} />
        </button>
      ))}
    </div>
  );
}

export function TokenPill({ token }: { token: Pick<Token, 'type'> }) {
  const { t } = useStore();
  return <span className={`badge ${token.type === 'priority' || token.type === 'rush' ? 'b-ink' : 'b-slime'}`}>{t(`token.${token.type}`)}</span>;
}

export function AccountName({ account }: { account?: Account | null }) {
  return <span className="mc">{account?.mcName ?? '?'}</span>;
}

export function Coords({ c }: { c?: Order['coords'] }) {
  const { t, lang } = useStore();
  if (!c) return <>—</>;
  return <span className="num">X {fmtN(c.x, lang)} · Y {fmtN(c.y, lang)} · Z {fmtN(c.z, lang)} <span className="mute">· {t(`dim.${c.dimension}`)}</span></span>;
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="lab">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="help">{hint}</span>}
      {error && <span className="err" id={`${htmlFor}-err`}><Glyph name="info" size={12} /> {error}</span>}
    </div>
  );
}

export function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="err" role="alert"><Glyph name="info" size={12} /> {msg}</p>;
}

/** Inline two-step confirmation for anything that can't be undone. */
export function ConfirmButton({ label, confirmTitle, confirmBody, confirmLabel, onConfirm, className = 'btn btn-secondary', id }: {
  label: string; confirmTitle?: string; confirmBody?: string; confirmLabel: string; onConfirm: () => void; className?: string; id: string;
}) {
  const { t } = useStore();
  const [armed, setArmed] = useState(false);
  if (!armed) return <button id={id} type="button" className={className} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <div className="confirm" role="alertdialog" aria-labelledby={`${id}-t`}>
      <p className="t-body" id={`${id}-t`}><b>{confirmTitle ?? t('common.sure')}</b> {confirmBody ?? ''}</p>
      <div className="row-gap">
        <button id={`${id}-yes`} type="button" className="btn btn-secondary btn-sm danger" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
        <button id={`${id}-no`} type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>{t('common.keep')}</button>
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card empty">
      {title && <p className="t-title">{title}</p>}
      {children && <div className="t-body ink2">{children}</div>}
      {action}
    </div>
  );
}

export function PageHead({ crumbs, title, lead, aside }: { crumbs?: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="page-head">
      {crumbs && <nav className="crumbs" aria-label="Pfad">{crumbs}</nav>}
      <div className="page-head-row">
        <div>
          <h1 className="d-l">{title}</h1>
          {lead && <p className="t-body ink2 lead">{lead}</p>}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, label, min = 1, max = 9999, decLabel, removeAtMin = false }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number; decLabel?: string; removeAtMin?: boolean }) {
  const { t } = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="stepper">
      <button type="button" aria-label={decLabel ?? t('qty.less')} onClick={() => { if (value > min) onChange(value - 1); else if (removeAtMin) onChange(0); }} disabled={value <= min && !removeAtMin}><Glyph name="minus" size={10} /></button>
      <input type="text" inputMode="numeric" aria-label={label} value={draft ?? String(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setDraft(v); const n = parseInt(v, 10); if (n >= min) onChange(Math.min(max, n)); }}
        onBlur={() => setDraft(null)} />
      <button type="button" aria-label={t('qty.more')} onClick={() => onChange(Math.min(max, value + 1))}><Glyph name="plus" size={10} /></button>
    </div>
  );
}
