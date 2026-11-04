import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  // Firefox too: the code uses the MV3 `action` API, which MV2 Firefox only has as `browserAction`.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Aegis',
    description: 'Blok script di situs yang kamu aktifkan, plus blok global untuk tracker dkk.',
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
      },
    }),
  }),
});
