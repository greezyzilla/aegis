import { describe, expect, it } from 'vitest';
import { readAndWatch } from '@/lib/readAndWatch';

function setup() {
  let resolveRead!: (v: string) => void;
  let emit!: (v: string) => void;
  let unwatched = false;
  const seen: string[] = [];
  const cleanup = readAndWatch(
    () => new Promise<string>((r) => (resolveRead = r)),
    (cb) => {
      emit = cb;
      return () => (unwatched = true);
    },
    (v) => seen.push(v),
  );
  return { resolveRead: (v: string) => resolveRead(v), emit: (v: string) => emit(v), seen, cleanup, unwatched: () => unwatched };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('readAndWatch', () => {
  it('uses the read, then later changes', async () => {
    const t = setup();
    t.resolveRead('stored');
    await flush();
    t.emit('changed');
    expect(t.seen).toEqual(['stored', 'changed']);
  });

  it('drops a read that resolves after a newer change', async () => {
    const t = setup();
    t.emit('new');
    t.resolveRead('stale');
    await flush();
    expect(t.seen).toEqual(['new']);
  });

  it('cleanup unwatches and ignores a late read', async () => {
    const t = setup();
    t.cleanup();
    t.resolveRead('late');
    await flush();
    expect(t.seen).toEqual([]);
    expect(t.unwatched()).toBe(true);
  });
});
