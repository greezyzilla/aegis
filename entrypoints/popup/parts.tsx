import { useId, useRef } from 'react';

/** Icons drawn with currentColor so they follow the text they sit next to. */
export const Icon = {
  chevron: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3.5 2l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  caret: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2 3.5l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  globe: (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8c1.8 1.9 2.6 3.9 2.6 6.2S9.8 12.3 8 14.2M8 1.8C6.2 3.7 5.4 5.7 5.4 8s.8 4.3 2.6 6.2" />
      </g>
    </svg>
  ),
  home: (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 7.2L8 2.5l5.5 4.7V13a.8.8 0 0 1-.8.8H9.6V10H6.4v3.8H3.3a.8.8 0 0 1-.8-.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  shield: (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.8l5.2 2v4c0 3.2-2.2 5.3-5.2 6.4C5 13.1 2.8 11 2.8 7.8v-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ban: (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.6" />
        <path d="M4 12L12 4" />
      </g>
    </svg>
  ),
};

/** Best-effort registrable domain, only for the avatar: "a.b.example.co.id" -> "example.co.id". */
function baseDomain(host: string): string {
  const parts = host.split('.');
  const [tld = '', sld = ''] = parts.slice(-2).reverse();
  if (parts.length >= 3 && tld.length === 2 && sld.length <= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/** A letter avatar per domain, so hosts are told apart at a glance. The page's own site gets a house. */
export function Avatar({ host, own }: { host: string; own?: boolean }) {
  if (own) {
    return (
      <span className="avatar avatar-own" aria-hidden="true">
        {Icon.home}
      </span>
    );
  }
  const base = baseDomain(host);
  let hash = 0;
  for (const ch of base) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" data-tone={hash % 6} aria-hidden="true">
      {base.charAt(0).toUpperCase()}
    </span>
  );
}

/** One line, cut with an ellipsis; on hover the full name scrolls through. */
export function HostName({ name, className = '' }: { name: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const start = () => {
    const el = ref.current;
    if (!el) return;
    const shift = el.scrollWidth - el.clientWidth;
    if (shift <= 0) return;
    el.style.setProperty('--shift', `-${shift}px`);
    el.style.setProperty('--dur', `${Math.max(1.5, shift / 40)}s`);
    el.dataset.run = '';
  };
  const stop = () => {
    if (ref.current) delete ref.current.dataset.run;
  };
  return (
    <span ref={ref} className={`host-name ${className}`} title={name} onMouseEnter={start} onMouseLeave={stop}>
      <span>{name}</span>
    </span>
  );
}

/** Script count: red when the scripts were blocked, green when a rule let them through. */
export function Count({ n, tone }: { n: number; tone: 'blocked' | 'allowed' | 'neutral' }) {
  if (n <= 0) return null;
  return <span className={`count count-${tone}`}>{n}</span>;
}

/** One control per row: "Izinkan" allows on this site; the menu holds "on every site". */
export function SplitAllow({ label, onSite, onGlobal }: { label: string; onSite: () => void; onGlobal: () => void }) {
  const id = useId();
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // The popover sits in the top layer: place it under the caret before it opens.
  const place = () => {
    const b = more.current?.getBoundingClientRect();
    if (!b || !menu.current) return;
    menu.current.style.top = `${b.bottom + 4}px`;
    menu.current.style.right = `${document.documentElement.clientWidth - b.right}px`;
  };
  return (
    <span className="split">
      <button type="button" className="split-main" onClick={onSite} aria-label={`Izinkan ${label} di situs ini`}>
        Izinkan
      </button>
      <button
        ref={more}
        type="button"
        className="split-more"
        popoverTarget={id}
        onClick={place}
        aria-label={`Pilihan lain untuk ${label}`}
      >
        {Icon.caret}
      </button>
      <div ref={menu} id={id} popover="auto" className="menu" role="menu">
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            menu.current?.hidePopover();
            onGlobal();
          }}
          aria-label={`Izinkan ${label} di semua situs`}
        >
          {Icon.globe}
          Izinkan di semua situs
        </button>
      </div>
    </span>
  );
}
