import { useState } from 'react';
import { Icon } from './parts';

interface Props {
  id: string;
  title: string;
  /** Shown next to the title, e.g. how many items the section holds. */
  count?: number;
  /** Right-aligned hint above the row actions. */
  aside?: string;
  /** Renders the title as a disclosure button; content stays hidden until opened. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Section({ id, title, count, aside, collapsible, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  const label = (
    <>
      {title}
      {count !== undefined && <span className="section-count">{count}</span>}
    </>
  );

  return (
    <section aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id} className="section-title">
          {collapsible ? (
            <button
              type="button"
              className="section-toggle"
              aria-expanded={open}
              aria-controls={`${id}-body`}
              onClick={() => setOpen(!open)}
            >
              <span className="chevron">{Icon.chevron}</span>
              {label}
            </button>
          ) : (
            label
          )}
        </h2>
        {aside && shown && <span className="section-aside muted">{aside}</span>}
      </div>
      {shown && <div id={`${id}-body`}>{children}</div>}
    </section>
  );
}
