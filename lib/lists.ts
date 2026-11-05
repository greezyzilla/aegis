import { storage } from '#imports';
import { hostFromUrl, hostMatches, isValidDomain } from './domain';
import { t } from '@/lib/i18n';

/** Public blocklists Aegis can download. Keyed by id; the id is stored in Settings.lists. */
export const LISTS = {
  easyprivacy: {
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    homepage: 'https://easylist.to/',
    license: 'GPL-3.0 / CC BY-SA 3.0',
  },
} as const;

export type ListId = keyof typeof LISTS;
export const LIST_IDS = Object.keys(LISTS) as ListId[];
export const isListId = (id: string): id is ListId => id in LISTS;

/**
 * A list entry that is not a plain domain: a URL pattern, or a domain limited to some sites.
 * `url` is already a valid DNR urlFilter (ABP and DNR share `||`, `|`, `^` and `*`).
 */
export interface ListFilter {
  url: string;
  /** An exception (`@@`): unblocks what the list blocks. */
  allow?: true;
  /** `$domain=` sites the entry is limited to (initiatorDomains) and excluded from (`~site`). */
  sites?: string[];
  notSites?: string[];
  /** `$third-party` / `$~third-party`. */
  party?: 'first' | 'third';
  /** Names the script type explicitly. Such entries are kept first when the browser's rule cap is tight. */
  script?: true;
}

/** What Aegis keeps from a downloaded list. */
export interface ListData {
  /** `||domain^` entries: blocked as scripts on every site. */
  domains: string[];
  /** `@@||domain^` entries: the list's own unblocks, excluded from the rule. */
  exceptions: string[];
  /** Path entries and site-restricted entries/exceptions. Absent in data saved before Aegis read them. */
  filters?: ListFilter[];
  updatedAt: number;
  /** Lines Aegis cannot apply to scripts (cosmetic, regex, other resource types, unsupported options). */
  skipped: number;
}

export const listDataItem = (id: ListId) => storage.defineItem<ListData | null>(`local:list:${id}`, { fallback: null });

/** Last download problem per list, shown in Options. */
export const listErrorItem = (id: ListId) =>
  storage.defineItem<string | null>(`local:listError:${id}`, { fallback: null });

/** A download smaller than this is treated as broken (error page, truncated file), keeping the old data. */
export const MIN_LIST_DOMAINS = 1000;

const DOMAIN_PATTERN = /^\|\|([a-z0-9.-]+)\^$/;
const COSMETIC = /#[@?$%]*#/;
/** ABP resource types; `all` covers every type. */
const TYPES = new Set([
  'script',
  'image',
  'stylesheet',
  'css',
  'object',
  'xmlhttprequest',
  'xhr',
  'subdocument',
  'frame',
  'ping',
  'beacon',
  'media',
  'font',
  'websocket',
  'webrtc',
  'other',
  'popup',
  'document',
  'doc',
  'all',
]);
const THIRD_PARTY = new Set(['third-party', '3p', '~first-party', '~1p']);
const FIRST_PARTY = new Set(['first-party', '1p', '~third-party', '~3p']);

interface Options {
  types: string[];
  notTypes: string[];
  party?: 'first' | 'third';
  sites: string[];
  notSites: string[];
  /** A `$domain=` value Aegis cannot express (e.g. `example.*`), on the positive or negated side. */
  badSite?: 'site' | 'notSite';
}

/** Parses `$options`; null when one is unknown or changes the action (redirect, csp, removeparam, ...). */
function parseOptions(raw: string | undefined): Options | null {
  const o: Options = { types: [], notTypes: [], sites: [], notSites: [] };
  for (const opt of raw ? raw.split(',') : []) {
    const neg = opt.startsWith('~');
    if (TYPES.has(neg ? opt.slice(1) : opt)) (neg ? o.notTypes : o.types).push(neg ? opt.slice(1) : opt);
    else if (THIRD_PARTY.has(opt)) o.party = 'third';
    else if (FIRST_PARTY.has(opt)) o.party = 'first';
    else if (opt === 'important') continue;
    else if (opt.startsWith('domain=')) {
      for (const d of opt.slice(7).split('|')) {
        const not = d.startsWith('~');
        const site = not ? d.slice(1) : d;
        if (isValidDomain(site)) (not ? o.notSites : o.sites).push(site);
        else o.badSite = not ? 'notSite' : 'site';
      }
    } else return null;
  }
  return o;
}

const appliesToScript = (o: Options) =>
  !o.notTypes.includes('script') && (!o.types.length || o.types.includes('script') || o.types.includes('all'));

/** ABP pattern -> DNR urlFilter, or null when DNR would reject it (non-ASCII, `|` inside, `||*`). */
function toUrlFilter(pattern: string): string | null {
  if (!/^[\x21-\x7e]+$/.test(pattern)) return null;
  // After `||` comes a host (wildcards allowed, e.g. `google.*`), as DNR expects.
  if (pattern.startsWith('||') && !/^\|\|[a-z0-9.-][a-z0-9.*-]*([/^:?|*]|$)/.test(pattern)) return null;
  const inner = pattern.replace(/^\|\|?/, '').replace(/\|$/, '');
  return inner && !inner.includes('|') ? pattern : null;
}

/** Host an `||host/...` pattern is pinned to, when the host part is complete. */
const anchoredHost = (url: string) => /^\|\|([a-z0-9.-]+)[/^:]/.exec(url)?.[1];

/**
 * Reads an Adblock Plus list for script blocking:
 * - `||domain^` blocks and `@@||domain^` exceptions with no site or first-party restriction go to
 *   `domains` / `exceptions` (one DNR rule holds them all);
 * - path entries and `$domain=` / `$~third-party` entries go to `filters` (one DNR rule each).
 * Lines that cannot affect scripts, or need what DNR lacks (cosmetic, regex, redirect, ...) are `skipped`.
 */
export function parseFilterList(text: string): Omit<ListData, 'updatedAt'> {
  const domains = new Set<string>();
  const exceptions = new Set<string>();
  const filters = new Map<string, ListFilter>();
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const allow = line.startsWith('@@');
    const body = allow ? line.slice(2) : line;
    const dollar = body.lastIndexOf('$');
    const pattern = (dollar > 0 ? body.slice(0, dollar) : body).toLowerCase();
    const options = parseOptions(dollar > 0 ? body.slice(dollar + 1).toLowerCase() : undefined);
    if (COSMETIC.test(line) || /^\/.*\/$/.test(pattern) || !options || !appliesToScript(options)) {
      skipped++;
      continue;
    }
    // A broken negated site would widen a block (or an unblock) to that site: drop the entry.
    // A broken positive site only narrows it, unless nothing is left.
    const sites = options.sites;
    if (options.badSite === 'notSite' || (options.badSite === 'site' && !sites.length)) {
      skipped++;
      continue;
    }

    const domain = DOMAIN_PATTERN.exec(pattern)?.[1];
    if (domain && !isValidDomain(domain)) {
      skipped++;
      continue;
    }
    if (domain && !sites.length && !options.notSites.length && options.party !== 'first') {
      (allow ? exceptions : domains).add(domain);
      continue;
    }

    const url = toUrlFilter(pattern);
    if (!url) {
      skipped++;
      continue;
    }
    const filter: ListFilter = { url };
    if (allow) filter.allow = true;
    if (sites.length) filter.sites = [...new Set(sites)];
    if (options.notSites.length) filter.notSites = [...new Set(options.notSites)];
    if (options.party) filter.party = options.party;
    if (options.types.includes('script')) filter.script = true;
    filters.set(JSON.stringify(filter), filter);
  }

  // A path block under a domain the list already blocks adds nothing but a rule.
  const covered = (host: string) => {
    const chain = [...hostAndParents(host)];
    return chain.some((h) => domains.has(h)) && !chain.some((h) => exceptions.has(h));
  };
  const kept = [...filters.values()].filter((f) => {
    const host = anchoredHost(f.url);
    return f.allow || !host || !covered(host);
  });
  skipped += filters.size - kept.length;
  return { domains: [...domains].sort(), exceptions: [...exceptions].sort(), filters: kept, skipped };
}

function* hostAndParents(host: string) {
  for (let h = host; h; h = h.slice(h.indexOf('.') + 1 || h.length)) yield h;
}

/** Downloads and parses a list. Throws with a readable message instead of returning bad data. */
export async function downloadList(id: ListId, fetchFn: typeof fetch = fetch): Promise<ListData> {
  const res = await fetchFn(LISTS[id].url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(t.listDownloadFailed(LISTS[id].name, res.status));
  const parsed = parseFilterList(await res.text());
  if (parsed.domains.length < MIN_LIST_DOMAINS) {
    throw new Error(t.listTooSmall(LISTS[id].name, parsed.domains.length));
  }
  return { ...parsed, updatedAt: Date.now() };
}

/** urlFilter -> RegExp, with DNR semantics for `||`, `|`, `^` and `*` (case-insensitive). */
export function urlFilterRegExp(url: string): RegExp {
  let src = url;
  let prefix = '';
  if (src.startsWith('||')) {
    prefix = '^[a-z][a-z0-9+.-]*://(?:[^/?#]*\\.)?';
    src = src.slice(2);
  } else if (src.startsWith('|')) {
    prefix = '^';
    src = src.slice(1);
  }
  const end = src.endsWith('|') ? '$' : '';
  if (end) src = src.slice(0, -1);
  const body = [...src]
    .map((c) => (c === '*' ? '.*' : c === '^' ? '(?:[^a-z0-9_.%-]|$)' : c.replace(/[.+?${}()|[\]\\/]/g, '\\$&')))
    .join('');
  return new RegExp(prefix + body + end, 'i');
}

/** Approximate site of a host (last two labels); good enough to tell first from third party here. */
const roughSite = (host: string) => host.split('.').slice(-2).join('.');

/**
 * "Did this list block that request" check, for tagging blocked scripts in the popup. Mirrors the
 * DNR rules from buildDnrRules: domains and filters block, exceptions and user overrides unblock,
 * and the list's `@@` filters do not apply on active sites.
 */
export function listMatcher(
  data: Pick<ListData, 'domains' | 'exceptions' | 'filters'>,
  allowed: string[],
  activeSites: string[] = [],
) {
  const blocked = new Set(data.domains);
  const excluded = [...data.exceptions, ...allowed];
  const compiled = (data.filters ?? []).map((f) => ({ ...f, re: urlFilterRegExp(f.url) }));
  const blocks = compiled.filter((f) => !f.allow);
  const unblocks = compiled.filter((f) => f.allow);
  const applies = (f: (typeof compiled)[number], url: string, host: string, initiator: string) =>
    (!f.sites || f.sites.some((s) => hostMatches(initiator, s))) &&
    !f.notSites?.some((s) => hostMatches(initiator, s)) &&
    (!f.party || (f.party === 'third') !== (roughSite(host) === roughSite(initiator))) &&
    f.re.test(url);

  return (url: string, initiator = ''): boolean => {
    const host = hostFromUrl(url);
    if (!host || excluded.some((d) => hostMatches(host, d))) return false;
    const onActive = activeSites.some((a) => hostMatches(initiator, a));
    if (!onActive && unblocks.some((f) => applies(f, url, host, initiator))) return false;
    for (const h of hostAndParents(host)) if (blocked.has(h)) return true;
    return blocks.some((f) => applies(f, url, host, initiator));
  };
}
