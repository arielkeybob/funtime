// Prévia de desenvolvimento: não é um backend do app nem integra a publicação.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function createDevServer() {
  const shell = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  const allowed = new Set([...shell.matchAll(/"\.\/([^\"]*)"/g)].map(match => match[1] || 'index.html'));
  allowed.add('sw.js');
  return http.createServer((req, res) => {
    const host = req.headers.host?.split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(host)) return res.writeHead(403).end();
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') return res.writeHead(302, { Location: '/funtime/' }).end();
    if (!url.pathname.startsWith('/funtime/')) return res.writeHead(404).end();
    const file = url.pathname.slice('/funtime/'.length) || 'index.html';
    if (!allowed.has(file)) return res.writeHead(404).end();
    try {
      let bytes = fs.readFileSync(path.join(root, file));
      if (file === 'index.html') {
        bytes = bytes.toString().replace('<head>', `<head><script>Object.defineProperty(navigator, 'standalone', { value: true });</script>`)
          .replace('</body>', `<div style="position:fixed;top:0;right:0;z-index:99999;background:#433719;color:#fff;padding:2px 8px;font:11px sans-serif;pointer-events:none">Prévia local · dados de teste</div></body>`);
      }
      if (file === 'sw.js') {
        // Mantém protocolo/lock do boot; GET sempre usa disco, sem cache antigo.
        bytes = bytes.toString().replace('const request = event.request;', 'const request = event.request; if (request.method === "GET") return;');
      }
      const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404).end(); }
  });
}
if (require.main === module) {
  const port = Number(process.env.FUNTIME_DEV_PORT || 4173);
  const server = createDevServer();
  server.on('error', error => { console.error('Não foi possível iniciar a prévia:', error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Prévia local: http://127.0.0.1:${server.address().port}/funtime/`));
}
module.exports = { createDevServer };
