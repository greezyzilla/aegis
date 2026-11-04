import { storage } from '#imports';
import { hostMatches, isValidDomain } from './domain';

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

/** What Aegis keeps from a downloaded list. */
export interface ListData {
  /** `||domain^` entries: blocked as scripts on every site. */
  domains: string[];
  /** `@@||domain^` entries: the list's own unblocks, excluded from the rule. */
  exceptions: string[];
  updatedAt: number;
  /** Lines that did not map to a domain block (cosmetic, paths, site-restricted, ...). */
  skipped: number;
}

export const listDataItem = (id: ListId) => storage.defineItem<ListData | null>(`local:list:${id}`, { fallback: null });

/** Last download problem per list, shown in Options. */
export const listErrorItem = (id: ListId) => storage.defineItem<string | null>(`local:listError:${id}`, { fallback: null });

/** A download smaller than this is treated as broken (error page, truncated file), keeping the old data. */
export const MIN_LIST_DOMAINS = 1000;

/** Options that keep a `||domain^` rule meaningful for a script block on every site. */
const ALLOWED_OPTIONS = new Set(['third-party', '3p', 'script']);
const DOMAIN_RULE = /^(@@)?\|\|([a-z0-9.-]+)\^(?:\$(.+))?$/;

/**
 * Keeps `||domain^` blocks and `@@||domain^` exceptions whose options are none, third-party or
 * script. Everything else (cosmetic, paths, regex, site-restricted, other resource types) is skipped.
 */
export function parseFilterList(text: string): Omit<ListData, 'updatedAt'> {
  const domains = new Set<string>();
  const exceptions = new Set<string>();
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const m = DOMAIN_RULE.exec(line.toLowerCase());
    const options = m?.[3]?.split(',') ?? [];
    if (!m || !isValidDomain(m[2]!) || !options.every((o) => ALLOWED_OPTIONS.has(o))) {
      skipped++;
      continue;
    }
    (m[1] ? exceptions : domains).add(m[2]!);
  }
  return { domains: [...domains].sort(), exceptions: [...exceptions].sort(), skipped };
}

/** Downloads and parses a list. Throws with a readable message instead of returning bad data. */
export async function downloadList(id: ListId, fetchFn: typeof fetch = fetch): Promise<ListData> {
  const res = await fetchFn(LISTS[id].url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Gagal unduh ${LISTS[id].name}: HTTP ${res.status}`);
  const parsed = parseFilterList(await res.text());
  if (parsed.domains.length < MIN_LIST_DOMAINS) {
    throw new Error(`${LISTS[id].name} cuma berisi ${parsed.domains.length} domain, kemungkinan file rusak`);
  }
  return { ...parsed, updatedAt: Date.now() };
}

/** Fast "is this host covered by the list" check: walks the host's parent domains. */
export function listMatcher(data: Pick<ListData, 'domains' | 'exceptions'>, allowed: string[]) {
  const blocked = new Set(data.domains);
  const excluded = [...data.exceptions, ...allowed];
  return (host: string): boolean => {
    if (excluded.some((d) => hostMatches(host, d))) return false;
    for (let h = host; h; h = h.slice(h.indexOf('.') + 1 || h.length)) {
      if (blocked.has(h)) return true;
    }
    return false;
  };
}
