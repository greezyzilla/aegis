import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  // Firefox too: the code uses the MV3 `action` API, which MV2 Firefox only has as `browserAction`.
  manifestVersion: 3,
  // The sources zip is uploaded to AMO when signing: keep the local board and test output out of it.
  zip: {
    excludeSources: ['backlog/**', 'coverage/**', 'test-results/**', 'playwright-report/**'],
  },
  manifest: ({ browser }) => ({
    // Text in public/_locales; English unless the browser is Indonesian, like the UI (lib/i18n).
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['declarativeNetRequest', 'webRequest', 'storage', 'tabs', 'alarms'],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'aegis@greezyzilla',
          // 140 (ESR): needed for data_collection_permissions; also covers DNR modifyHeaders (128+).
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        // Firefox for Android only supports data_collection_permissions from 142.
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
