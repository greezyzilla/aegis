import { browser } from '#imports';
import { INLINE_CSP } from '@/lib/rules';
import type { InlineBlockedMessage } from '@/lib/types';

/**
 * Reports inline scripts blocked by Aegis' CSP in every frame (page and iframes).
 * Violations of the site's own CSP are ignored: only our policy is counted.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    let pending = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      const msg: InlineBlockedMessage = { type: 'aegis:inline-blocked', count: pending };
      pending = 0;
      void browser.runtime.sendMessage(msg).catch(() => {});
    };

    document.addEventListener(
      'securitypolicyviolation',
      (e) => {
        if (e.blockedURI !== 'inline' || !e.effectiveDirective.startsWith('script-src')) return;
        if (e.originalPolicy.trim() !== INLINE_CSP) return;
        pending++;
        timer ??= setTimeout(flush, 200);
      },
      true,
    );
  },
});
