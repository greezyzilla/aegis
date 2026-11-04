import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Aegis',
    description: 'Blok script di situs yang kamu aktifkan, plus blok global untuk tracker dkk.',
    permissions: ['declarativeNetRequest', 'webRequest', 'storage', 'tabs', 'alarms'],
    host_permissions: ['<all_urls>'],
  },
});
