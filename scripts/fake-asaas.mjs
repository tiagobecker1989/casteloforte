// Simulador mínimo da API do Asaas (apenas o que a integração usa), para testes sem internet/chave.
// Segue o contrato lido na documentação oficial; NÃO substitui o teste no sandbox real.
import http from 'http';
const KEY = '$aact_hmlg_fake';
const st = { customers: [], payments: [], deleted: [] };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === '/_state') return send(res, 200, st);
    if (req.headers.access_token !== KEY) return send(res, 401, { errors: [{ code: 'invalid_access_token', description: 'A chave de API informada é inválida' }] });
    if (!req.headers['user-agent']) return send(res, 400, { errors: [{ description: 'User-Agent obrigatório' }] });
    if (req.method === 'POST' && url.pathname === '/v3/customers') {
      if (!body.name || !body.cpfCnpj) return send(res, 400, { errors: [{ description: 'name e cpfCnpj são obrigatórios' }] });
      const c = { id: `cus_${st.customers.length + 1}`, ...body }; st.customers.push(c); return send(res, 200, c);
    }
    if (req.method === 'GET' && url.pathname === '/v3/payments') {
      const ref = url.searchParams.get('externalReference');
      return send(res, 200, { data: st.payments.filter(p => p.externalReference === ref && !p.deleted) });
    }
    if (req.method === 'POST' && url.pathname === '/v3/payments') {
      if (!st.customers.find(c => c.id === body.customer)) return send(res, 400, { errors: [{ description: 'Cliente inválido' }] });
      if (body.billingType !== 'UNDEFINED' || !(body.value > 0) || !body.dueDate || !body.externalReference) return send(res, 400, { errors: [{ description: 'Campos inválidos' }] });
      if (body.dueDate < new Date().toISOString().slice(0, 10)) return send(res, 400, { errors: [{ description: 'Vencimento no passado' }] });
      const p = { id: `pay_${st.payments.length + 1}`, status: 'PENDING', invoiceUrl: `https://fake.asaas.test/i/${st.payments.length + 1}`, ...body };
      st.payments.push(p); return send(res, 200, p);
    }
    const m = url.pathname.match(/^\/v3\/payments\/([^/]+)$/);
    if (req.method === 'DELETE' && m) { const p = st.payments.find(x => x.id === m[1]); if (p) p.deleted = true; st.deleted.push(m[1]); return send(res, 200, { deleted: true, id: m[1] }); }
    send(res, 404, { errors: [{ description: 'não encontrado' }] });
  });
}).listen(Number(process.env.FAKE_PORT || 3199), () => console.log('fake asaas on', process.env.FAKE_PORT || 3199));
