import { describe, expect, it } from 'vitest';
import {
  fileFromUrl,
  hostFromUrl,
  hostMatches,
  isValidDomain,
  isValidScript,
  normalizeDomain,
  normalizeScript,
  siteOf,
} from '@/lib/domain';

describe('normalizeDomain', () => {
  it.each([
    ['cdn.jsdelivr.net', 'cdn.jsdelivr.net'],
    ['  CDN.JsDelivr.NET  ', 'cdn.jsdelivr.net'],
    ['https://cdn.jsdelivr.net/npm/x.js?v=1#a', 'cdn.jsdelivr.net'],
    ['http://localhost:8080', 'localhost'],
    ['*.example.com', 'example.com'],
    ['.example.com.', 'example.com'],
    ['example.com/path', 'example.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe('isValidDomain', () => {
  it.each(['example.com', 'sub.cdn.example.co.id', 'localhost', 'xn--bcher-kva.example'])('accepts %s', (d) => {
    expect(isValidDomain(d)).toBe(true);
  });
  it.each(['', 'exa mple.com', 'example..com', 'example.com/x', 'ex*ample.com', 'example.com:80'])(
    'rejects %j',
    (d) => {
      expect(isValidDomain(d)).toBe(false);
    },
  );
});

describe('normalizeScript / isValidScript', () => {
  it('strips characters that are special in a DNR urlFilter', () => {
    expect(normalizeScript(' |jquery^.min.js ')).toBe('jquery.min.js');
  });
  it('keeps * as wildcard', () => {
    expect(normalizeScript('/lib/*.js')).toBe('/lib/*.js');
  });
  it('rejects non-ASCII', () => {
    expect(isValidScript('skrip-ñ.js')).toBe(false);
    expect(isValidScript('app.js')).toBe(true);
  });
});

describe('hostMatches', () => {
  it('matches the domain itself and its subdomains', () => {
    expect(hostMatches('example.com', 'example.com')).toBe(true);
    expect(hostMatches('cdn.example.com', 'example.com')).toBe(true);
    expect(hostMatches('a.b.example.com', 'example.com')).toBe(true);
  });
  it('does not match lookalike domains or parents', () => {
    expect(hostMatches('evilexample.com', 'example.com')).toBe(false);
    expect(hostMatches('example.com.evil.net', 'example.com')).toBe(false);
    expect(hostMatches('example.com', 'cdn.example.com')).toBe(false);
  });
});

describe('url helpers', () => {
  it('siteOf strips only a leading www.', () => {
    expect(siteOf('www.github.com')).toBe('github.com');
    expect(siteOf('gist.github.com')).toBe('gist.github.com');
  });
  it('hostFromUrl only accepts http(s)', () => {
    expect(hostFromUrl('https://www.github.com/x')).toBe('www.github.com');
    expect(hostFromUrl('brave://settings')).toBeNull();
    expect(hostFromUrl('chrome-extension://abc/popup.html')).toBeNull();
    expect(hostFromUrl('not a url')).toBeNull();
    expect(hostFromUrl(undefined)).toBeNull();
  });
  it('fileFromUrl returns the last path segment', () => {
    expect(fileFromUrl('https://cdn.test/npm/jquery.min.js?v=3')).toBe('jquery.min.js');
    expect(fileFromUrl('https://cdn.test/')).toBe('/');
    expect(fileFromUrl('garbage')).toBe('garbage');
  });
});
