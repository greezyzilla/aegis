// Local pages for the Firefox run; same layout as e2e/fixtures.ts.
import http from 'node:http';

/** Every host the pages use; the profile resolves them to 127.0.0.1. */
export const HOSTS = [
  'site-a.test',
  'www.site-a.test',
  'site-b.test',
  'cdn.test',
  'sub.cdn.test',
  'other.test',
  'stream.test',
  'player.test',
];

/**
 * /page loads: inline script, /self.js, cdn.test/lib/a.js, cdn.test/lib/b.js, sub.cdn.test/c.js,
 * other.test/d.js. Each script appends "<host><path>" to window.loaded.
 * /embed is a page with an inline script and a player.test iframe (inline script + cdn.test/lib/a.js).
 */
export function startServer() {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const port = server.address().port;
    const html = (body) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><body>${body}</body></html>`);
    };
    if (req.url.startsWith('/embed')) {
      return html(`<script>window.inline = 1</script><iframe src="http://player.test:${port}/player"></iframe>`);
    }
    if (req.url.startsWith('/player')) {
      return html(`<script>window.inline = 1</script><script src="http://cdn.test:${port}/lib/a.js"></script>`);
    }
    if (req.url.startsWith('/page')) {
      return html(`<script>window.inline = 1</script>
<script src="/self.js"></script>
<script src="http://cdn.test:${port}/lib/a.js"></script>
<script src="http://cdn.test:${port}/lib/b.js"></script>
<script src="http://sub.cdn.test:${port}/c.js"></script>
<script src="http://other.test:${port}/d.js"></script>`);
    }
    res.setHeader('content-type', 'text/javascript');
    res.end(`window.loaded = (window.loaded || []).concat(${JSON.stringify(host + req.url)});`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
