import React, { useState } from 'react';
import type { Account, Order, OrderStatus, Token } from '../domain/types';
import { PROGRESS_STEPS } from '../domain/rules';
import { useStore } from '../data/store';

export function fmtDate(iso: string | undefined, lang: string, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function relDays(targetIso: string, now: number, t: ReturnType<typeof useStore>['t']) {
  const days = (Date.parse(targetIso) - now) / 864e5;
  if (days >= 1) return t('time.inDays', { n: Math.ceil(days) });
  if (days > 0) return t('time.inHours', { n: Math.max(1, Math.ceil(days * 24)) });
  if (days > -1) return t('time.hoursAgo', { n: Math.max(1, Math.floor(-days * 24)) });
  return t('time.daysAgo', { n: Math.floor(-days) });
}

export function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useStore();
  return <span className={`chip chip-${status}`}>{t(`status.short.${status}`)}</span>;
}

/** The five customer-facing steps. Cancelled/declined orders show where they stopped. */
export function StatusTimeline({ order }: { order: Order }) {
  const { t, lang } = useStore();
  const reached = (s: OrderStatus) => order.history.find((h) => h.status === s);
  const stopped = order.status === 'cancelled' || order.status === 'declined';
  const currentIdx = order.status === 'delivered' ? 3 : PROGRESS_STEPS.indexOf(order.status);
  return (
    <ol className="timeline">
      {PROGRESS_STEPS.map((s, i) => {
        const ev = reached(s);
        const state = ev ? (i === currentIdx && !stopped && s !== 'completed' ? 'current' : 'done') : 'todo';
        return (
          <li key={s} className={`step step-${state}`}>
            <span className="dot" aria-hidden="true" />
            <div className="step-body">
              <div className="step-title">{t(`status.long.${s}`)}</div>
              <div className="step-time">{ev ? fmtDate(ev.at, lang) : ' '}</div>
            </div>
          </li>
        );
      })}
      {stopped && (
        <li className="step step-stopped">
          <span className="dot" aria-hidden="true" />
          <div className="step-body">
            <div className="step-title">{t(`status.long.${order.status}`)}</div>
            <div className="step-time">{fmtDate(order.history.at(-1)?.at, lang)}</div>
          </div>
        </li>
      )}
    </ol>
  );
}

export function Stars({ value, max = 5, size = 'md' }: { value: number | null; max?: number; size?: 'sm' | 'md' }) {
  const v = value ?? 0;
  return (
    <span className={`stars stars-${size}`} aria-label={value === null ? '—' : `${v.toFixed(1)} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < Math.round(v) ? 'on' : 'off'} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

export function StarInput({ id, value, onChange, label }: { id: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="star-input" role="radiogroup" aria-label={label} id={id}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n}`}
          className={n <= value ? 'on' : 'off'} onClick={() => onChange(value === n ? 0 : n)}>★</button>
      ))}
    </div>
  );
}

export function TokenPill({ token }: { token: Pick<Token, 'type'> }) {
  const { t } = useStore();
  return <span className={`token token-${token.type}`}>{t(`token.${token.type}`)}</span>;
}

export function AccountName({ account }: { account?: Account | null }) {
  return <span className="mc">{account?.mcName ?? '?'}</span>;
}

export function Coords({ c }: { c?: Order['coords'] }) {
  const { t } = useStore();
  if (!c) return <>—</>;
  return <span className="mono">{c.x} / {c.y} / {c.z} <span className="muted">({t(`dim.${c.dimension}`)})</span></span>;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="error" role="alert">{msg}</p>;
}

/** Inline two-step confirmation (the preview frame blocks window.confirm). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn', id }: {
  label: string; confirmLabel: string; onConfirm: () => void; className?: string; id: string;
}) {
  const { t } = useStore();
  const [armed, setArmed] = useState(false);
  if (!armed) return <button id={id} type="button" className={className} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="confirm">
      <button id={`${id}-yes`} type="button" className={`${className} danger`} onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button id={`${id}-no`} type="button" className="btn ghost" onClick={() => setArmed(false)}>{t('common.back')}</button>
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
