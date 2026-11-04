import type { Browser } from '#imports';
import type { PopupPortMessage } from './tabs';

/**
 * The popup's port to the background. The MV3 service worker can stop while the popup stays open,
 * which disconnects the port. Posting then reconnects instead of throwing, and a pending change is
 * re-sent as soon as the port drops, so the background still reloads the tab when the popup closes.
 */
export function popupPort(connect: () => Browser.runtime.Port) {
  let port: Browser.runtime.Port | null = null;
  let last: PopupPortMessage | null = null;
  let closed = false;

  const open = () => {
    const p = connect();
    port = p;
    p.onDisconnect.addListener(() => {
      if (port !== p) return;
      port = null;
      if (!closed && last?.type === 'changed') send(last);
    });
    return p;
  };

  const send = (msg: PopupPortMessage) => {
    try {
      (port ?? open()).postMessage(msg);
    } catch {
      // Disconnected without the event having fired yet: one fresh port.
      port = null;
      try {
        open().postMessage(msg);
      } catch {
        // Extension context gone (reloaded or updated); nothing left to tell.
      }
    }
  };

  try {
    open();
  } catch {
    port = null;
  }

  return {
    post(msg: PopupPortMessage) {
      if (closed) return;
      last = msg;
      send(msg);
    },
    close() {
      closed = true;
      port?.disconnect();
      port = null;
    },
  };
}
