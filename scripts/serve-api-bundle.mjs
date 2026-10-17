// Simula a Vercel localmente: carrega api/index.js (o bundle) e o expõe via http. Uso nos testes.
// PREPARSE=1 imita os "helpers" da Vercel, que entregam req.body já lido (stream consumido).
import http from 'http';
const { default: app } = await import('../api/index.js');
http.createServer(async (req, res) => {
  if (process.env.PREPARSE === '1' && !['GET', 'HEAD'].includes(req.method)) {
    const partes = []; for await (const c of req) partes.push(c);
    const bruto = Buffer.concat(partes);
    if (/json/i.test(req.headers['content-type'] || '')) { try { req.body = bruto.length ? JSON.parse(bruto.toString('utf8')) : undefined; } catch { req.body = bruto.toString('utf8'); } }
    else req.body = bruto;
  }
  app(req, res);
}).listen(Number(process.env.PORT || 3000), () => console.log('bundle up on', process.env.PORT));
