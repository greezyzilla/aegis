import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { importSettings } from '@/entrypoints/options/backup';
import { addRules, settingsItem, setSiteFlag } from '@/lib/settings';

const file = (data: unknown) => new File([typeof data === 'string' ? data : JSON.stringify(data)], 'b.json');

beforeEach(() => {
  fakeBrowser.reset();
});

describe('importSettings', () => {
  it('rejects files that are not an Aegis backup', async () => {
    await expect(importSettings(file({ rules: [] }))).rejects.toThrow('Bukan file backup Aegis');
    await expect(importSettings(file('{not json'))).rejects.toThrow();
  });

  it('normalizes entries and skips invalid ones', async () => {
    const n = await importSettings(
      file({
        app: 'aegis',
        version: 1,
        rules: [
          { domain: 'https://CDN.test/x', scope: 'global' },
          { domain: 'cdn.test', script: 'a.js', scope: 'www.Site.test' },
          { domain: 'bad domain', scope: 'global' },
          { domain: 'ok.test', scope: 'bad site' },
          { domain: 'ok.test', script: 'ñ.js', scope: 'global' },
          null,
        ],
        blocks: [{ domain: 'Tracker.test' }, { domain: 'ads.test', script: 'px.js' }, { domain: 'bad domain' }],
        activeSites: ['News.test', 'bad site'],
        inlineSites: 'not-an-array',
      }),
    );
    expect(n).toBe(4);
    const s = await settingsItem.getValue();
    expect(s.rules.map(({ domain, script, scope }) => ({ domain, script, scope }))).toEqual([
      { domain: 'cdn.test', script: undefined, scope: 'global' },
      { domain: 'cdn.test', script: 'a.js', scope: 'www.site.test' },
    ]);
    expect(s.blocks.map(({ domain, script }) => ({ domain, script }))).toEqual([
      { domain: 'tracker.test', script: undefined },
      { domain: 'ads.test', script: 'px.js' },
    ]);
    expect(s.activeSites).toEqual(['news.test']);
    expect(s.inlineSites).toEqual([]);
  });

  it('merges into existing settings without duplicates', async () => {
    await addRules([{ domain: 'cdn.test', scope: 'global' }]);
    await setSiteFlag('activeSites', 'a.test', 'a.test', true);
    await importSettings(
      file({ app: 'aegis', version: 2, rules: [{ domain: 'cdn.test', scope: 'global' }, { domain: 'new.test', scope: 'global' }], blocks: [], activeSites: ['a.test', 'b.test'], inlineSites: [] }),
    );
    const s = await settingsItem.getValue();
    expect(s.rules.map((r) => r.domain)).toEqual(['cdn.test', 'new.test']);
    expect(s.activeSites).toEqual(['a.test', 'b.test']);
  });

  it('still reads a v1 backup, ignoring its paused sites', async () => {
    const n = await importSettings(
      file({ app: 'aegis', version: 1, rules: [{ domain: 'cdn.test', scope: 'global' }], pausedSites: ['a.test'], inlineSites: ['b.test'] }),
    );
    expect(n).toBe(1);
    const s = await settingsItem.getValue();
    expect(s.activeSites).toEqual([]);
    expect(s.inlineSites).toEqual(['b.test']);
  });
});
