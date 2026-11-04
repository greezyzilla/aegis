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

/** Script blocked on every site, active or not (trackers and the like). */
export interface BlockRule {
  id: string;
  domain: string;
  script?: string;
  createdAt: number;
}

export type NewBlock = Pick<BlockRule, 'domain' | 'script'>;

export interface Settings {
  /** Allow rules. Only matter on active sites; "global" means every active site. */
  rules: AllowRule[];
  /** Blocked on every site and outranks allow rules. */
  blocks: BlockRule[];
  /** Sites where every script is blocked unless allowed. Elsewhere only `blocks` apply. */
  activeSites: string[];
  /** Sites where inline <script> is allowed (on active sites). */
  inlineSites: string[];
  /** Enabled public blocklists, by id (see lib/lists.ts). Their data lives in its own storage key. */
  lists: string[];
  /** Hosts the user unblocked from the public lists. */
  listAllow: string[];
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
  /** Id of the public list that blocked it, if any. */
  list?: string;
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
  /** Host of the top-level page; missing in state saved before it was tracked. */
  page?: string;
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
