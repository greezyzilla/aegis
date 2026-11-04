import { describe, expect, it } from 'vitest';
import type { Browser } from '#imports';
import { popupPort } from '@/lib/popupPort';

/** A port that records posts, throws once disconnected, and lets the test drop it like a stopped worker. */
function fakePort() {
  const listeners: (() => void)[] = [];
  const port = {
    sent: [] as unknown[],
    dead: false,
    postMessage(msg: unknown) {
      if (port.dead) throw new Error('Attempting to use a disconnected port object');
      port.sent.push(msg);
    },
    disconnect() {
      port.dead = true;
    },
    onDisconnect: { addListener: (cb: () => void) => listeners.push(cb) },
    /** The background went away: the port dies and onDisconnect fires. */
    drop() {
      port.dead = true;
      listeners.forEach((cb) => cb());
    },
  };
  return port;
}

function setup() {
  const ports: ReturnType<typeof fakePort>[] = [];
  const connect = () => {
    const p = fakePort();
    ports.push(p);
    return p as unknown as Browser.runtime.Port;
  };
  return { ports, port: popupPort(connect) };
}

describe('popupPort', () => {
  it('connects on creation and posts on that port', () => {
    const { ports, port } = setup();
    expect(ports).toHaveLength(1);
    port.post({ type: 'changed', tabId: 7 });
    expect(ports[0]!.sent).toEqual([{ type: 'changed', tabId: 7 }]);
  });

  it('reconnects instead of throwing when the background dropped the port', () => {
    const { ports, port } = setup();
    ports[0]!.drop();
    expect(() => port.post({ type: 'changed', tabId: 7 })).not.toThrow();
    expect(ports).toHaveLength(2);
    expect(ports[1]!.sent).toEqual([{ type: 'changed', tabId: 7 }]);
  });

  it('reconnects when the port died before onDisconnect fired', () => {
    const { ports, port } = setup();
    ports[0]!.dead = true;
    expect(() => port.post({ type: 'changed', tabId: 7 })).not.toThrow();
    expect(ports[1]!.sent).toEqual([{ type: 'changed', tabId: 7 }]);
  });

  it('re-sends a pending change to the restarted background so the close still reloads', () => {
    const { ports, port } = setup();
    port.post({ type: 'changed', tabId: 7 });
    ports[0]!.drop();
    expect(ports).toHaveLength(2);
    expect(ports[1]!.sent).toEqual([{ type: 'changed', tabId: 7 }]);
  });

  it('does not reconnect on a drop when nothing is pending', () => {
    const { ports, port } = setup();
    port.post({ type: 'changed', tabId: 7 });
    port.post({ type: 'reloaded' });
    ports[0]!.drop();
    expect(ports).toHaveLength(1);
  });

  it('stays quiet after close', () => {
    const { ports, port } = setup();
    port.post({ type: 'changed', tabId: 7 });
    port.close();
    expect(ports[0]!.dead).toBe(true);
    port.post({ type: 'changed', tabId: 8 });
    expect(ports).toHaveLength(1);
  });

  it('never throws when the extension context is gone', () => {
    const port = popupPort(() => {
      throw new Error('Extension context invalidated.');
    });
    expect(() => port.post({ type: 'changed', tabId: 7 })).not.toThrow();
  });
});
