// Simulador da API Pix do Sicredi (mTLS + OAuth + GET /api/v2/pix paginado). Só para testes.
import https from 'https';
import fs from 'fs';
const dir = process.env.CERTS || '/tmp/certs';
const estado = { tokens: 0, consultas: 0, semCert: 0 };
const pix = [
  { endToEndId: 'E1', txid: 'T1', valor: '80.00', chave: 'k', horario: '2026-01-12T14:00:00Z', pagador: { nome: 'MARIA SILVA SOUZA' }, infoPagador: 'oferta' },
  { endToEndId: 'E2', txid: 'T2', valor: '25.50', chave: 'k', horario: '2026-01-13T02:30:00Z', infoPagador: 'ajuda' },
  { endToEndId: 'E3', txid: 'T3', valor: '10.00', chave: 'k', horario: '2026-01-14T12:00:00Z', pagador: { nome: 'FULANO DE TAL' } },
];
const srv = https.createServer({ key: fs.readFileSync(`${dir}/srv.key`), cert: fs.readFileSync(`${dir}/srv.pem`), ca: fs.readFileSync(`${dir}/ca.pem`), requestCert: true, rejectUnauthorized: true }, (req, res) => {
  const url = new URL(req.url, 'https://x'); let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => {
    const j = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/_estado') return j(200, estado);
    if (!req.socket.authorized) { estado.semCert++; return j(403, { detail: 'mTLS' }); }
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      estado.tokens++;
      const ok = req.headers.authorization === 'Basic ' + Buffer.from('cid-teste:csecret-teste').toString('base64');
      const p = new URLSearchParams(raw);
      if (!ok) return j(401, { error: 'unauthorized' });
      if (p.get('grant_type') !== 'client_credentials' || !/pix\.read/.test(p.get('scope') || '')) return j(400, { detail: 'escopo' });
      return j(200, { access_token: 'tok-' + estado.tokens, token_type: 'Bearer', expires_in: 3600, scope: 'pix.read' });
    }
    if (req.method === 'GET' && url.pathname === '/api/v2/pix') {
      if (!/^Bearer tok-/.test(req.headers.authorization || '')) return j(401, {});
      estado.consultas++;
      const pag = Number(url.searchParams.get('paginacao.paginaAtual') || 0), por = 2;
      return j(200, { parametros: { inicio: url.searchParams.get('inicio'), fim: url.searchParams.get('fim'), paginacao: { paginaAtual: pag, itensPorPagina: por, quantidadeDePaginas: Math.ceil(pix.length / por), quantidadeTotalDeItens: pix.length } }, pix: pix.slice(pag * por, pag * por + por) });
    }
    j(404, {});
  });
}).listen(Number(process.env.FAKE_SICREDI_PORT || 3299), () => console.log('fake sicredi on'));
