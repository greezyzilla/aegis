import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Aegis',
    description: 'Blok semua script, lalu izinkan per domain (global atau per situs).',
    permissions: ['declarativeNetRequest', 'webRequest', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
});
