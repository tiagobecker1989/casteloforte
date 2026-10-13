// Simula a Vercel localmente: carrega api/index.js (o bundle) e o expõe via http. Uso nos testes.
// PREPARSE=1 imita os "helpers" da Vercel, que entregam req.body já lido (stream consumido).
import http from 'http';
const { default: app } = await import('../api/index.js');
http.createServer(async (req, res) => {
  if (process.env.PREPARSE === '1' && !['GET', 'HEAD'].includes(req.method)) {
    let raw = ''; for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
  }
  app(req, res);
}).listen(Number(process.env.PORT || 3000), () => console.log('bundle up on', process.env.PORT));
