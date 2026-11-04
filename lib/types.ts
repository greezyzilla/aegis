/** "global" or a site domain such as "github.com" (also matches its subdomains). */
export type Scope = 'global' | (string & {});

export interface AllowRule {
  id: string;
  /** Script origin domain, e.g. "cdn.jsdelivr.net". Also matches its subdomains. */
  domain: string;
  /** Optional script name or path fragment, e.g. "jquery.min.js". `*` is a wildcard. */
  script?: string;
  scope: Scope;
  createdAt: number;
}

export type NewRule = Pick<AllowRule, 'domain' | 'script' | 'scope'>;

export interface Settings {
  /** Master switch. When off, no rule is installed at all. */
  enabled: boolean;
  rules: AllowRule[];
  /** Sites where blocking is paused entirely. */
  pausedSites: string[];
  /** Sites where inline <script> is allowed. */
  inlineSites: string[];
  /** Reload the tab when the popup closes after a change. Missing means on. */
  autoReload?: boolean;
}

export interface ScriptEntry {
  url: string;
  host: string;
  /** Last path segment, used as the default "script name". */
  file: string;
  /** Host of the document that requested the script (page or iframe). */
  initiator: string;
  blocked: boolean;
}

/** Inline scripts our CSP blocked in one frame host (the page itself or an iframe). */
export interface InlineBlock {
  host: string;
  count: number;
}

export interface TabState {
  scripts: ScriptEntry[];
  /** Hosts of iframes loaded in the tab. */
  frames: string[];
  inline: InlineBlock[];
}

export const emptyTabState = (): TabState => ({ scripts: [], frames: [], inline: [] });

/** Fills fields missing from state persisted by an older version. */
export const normalizeTabState = (s: Partial<TabState> | null | undefined): TabState => ({
  ...emptyTabState(),
  ...s,
});

/** Message sent by the inline-watch content script. */
export interface InlineBlockedMessage {
  type: 'aegis:inline-blocked';
  count: number;
}
