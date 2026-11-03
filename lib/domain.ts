/** Turns "https://www.Example.com:8080/x", "*.example.com" etc. into "www.example.com" / "example.com". */
export function normalizeDomain(input: string): string {
  const withoutScheme = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  return (withoutScheme.split(/[/?#]/)[0] ?? '')
    .replace(/:\d+$/, '')
    .replace(/^\*\./, '')
    .replace(/^\.+|\.+$/g, '');
}

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(domain);
}

/** Keeps characters that are safe inside a DNR urlFilter. `*` stays a wildcard. */
export function normalizeScript(input: string): string {
  return input.trim().replace(/[|^\s]/g, '');
}

export function isValidScript(script: string): boolean {
  return /^[\x21-\x7e]+$/.test(script);
}

/** "www.github.com" -> "github.com". Used as the default scope for "this site". */
export function siteOf(host: string): string {
  return host.replace(/^www\./, '');
}

/** True when host is the domain itself or one of its subdomains. */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

export function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

export function fileFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split('/').filter(Boolean).pop() ?? path;
  } catch {
    return url;
  }
}
