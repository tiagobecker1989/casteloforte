// Testa a integração com o Asaas contra o simulador (scripts/fake-asaas.mjs). Veja /tmp/e2e-asaas.sh no README.
const B = process.env.BASE + '/api', FAKE = process.env.FAKE, TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
let falhas = 0, total = 0;
const ok = (c, n, x = '') => { total++; if (!c) { falhas++; console.log('  FALHOU:', n, x); } };
const call = async (m, p, tok, body, headers = {}) => {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
const fake = async () => (await fetch(FAKE + '/_state')).json();
const login = async (e, s) => (await call('POST', '/auth/login', null, { email: e, senha: s })).j?.token;
const hook = (event, payment, token = TOKEN) => call('POST', '/webhooks/asaas', null, { event, payment }, { 'asaas-access-token': token });

await call('POST', '/auth/solicitar-cadastro', null, { paroquia: { nome: 'Par Asaas' }, responsavel: { nome: 'R', email: 'as@x.org', senha: 'senha1234' }, aceitou: true });
const TS = await login('sede@cf.org', 'Sede@12345');
const id = (await call('GET', '/sede/paroquias', TS)).j.find(p => p.nome === 'Par Asaas').id;
await call('PATCH', `/sede/paroquias/${id}/status`, TS, { status: 'ATIVA' });
const TA = await login('as@x.org', 'senha1234');
const pago = (await call('GET', '/sede/planos', TS)).j.find(p => p.precoMensal > 0 && p.limiteMembros);
await call('POST', '/assinatura/plano', TA, { planoId: pago.id });

console.log('# fatura sem documento');
ok((await call('GET', '/assinatura', TA)).j.pagamentoOnline === true, 'pagamento online habilitado');
ok((await call('POST', '/sede/faturas/gerar', TS, { competencia: '2099-02' })).j.criadas === 1, 'fatura gerada');
let ass = (await call('GET', '/assinatura', TA)).j;
const fat = ass.faturas[0];
ok(!fat.linkPagamento && ass.documento === null, 'sem link enquanto não há CNPJ');
const sem = await call('POST', `/assinatura/faturas/${fat.id}/pagar`, TA);
ok(sem.s === 400 && /CNPJ/.test(sem.j.error), 'pedir link exige CNPJ/CPF', JSON.stringify(sem));
ok((await fake()).payments.length === 0, 'nada foi enviado ao gateway');

console.log('# documento e cobrança');
ok((await call('POST', '/assinatura/documento', TA, { cpfCnpj: '11.222.333/0001-82' })).s === 400, 'CNPJ com dígito errado é recusado');
ok((await call('POST', '/assinatura/documento', TA, { cpfCnpj: '11.222.333/0001-81' })).s === 200, 'CNPJ válido aceito');
let st = await fake();
ok(st.customers.length === 1 && st.customers[0].cpfCnpj === '11222333000181' && st.customers[0].externalReference === id && st.customers[0].email === 'as@x.org', 'cliente criado no gateway com CNPJ só dígitos', JSON.stringify(st.customers));
ok(st.payments.length === 1 && st.payments[0].externalReference === fat.id && st.payments[0].billingType === 'UNDEFINED' && st.payments[0].value === pago.precoMensal, 'cobrança criada automaticamente com referência da fatura', JSON.stringify(st.payments));
ass = (await call('GET', '/assinatura', TA)).j;
ok(/^https:\/\/fake\.asaas\.test\/i\//.test(ass.faturas[0].linkPagamento) && ass.documentoTravado, 'link da fatura salvo');
const u1 = await call('POST', `/assinatura/faturas/${fat.id}/pagar`, TA);
ok(u1.s === 200 && u1.j.url === ass.faturas[0].linkPagamento && (await fake()).payments.length === 1, 'pedir link de novo não duplica a cobrança');
ok((await call('POST', '/assinatura/documento', TA, { cpfCnpj: '52998224725' })).s === 409, 'documento travado após ir ao gateway');

console.log('# webhook');
ok((await hook('PAYMENT_RECEIVED', { id: 'pay_1', externalReference: fat.id, value: pago.precoMensal }, 'errado')).s === 401, 'token inválido => 401');
ok((await call('POST', '/webhooks/asaas', null, { event: 'PAYMENT_RECEIVED' })).s === 401, 'sem token => 401');
const ign = await hook('PAYMENT_CREATED', { id: 'pay_1', externalReference: fat.id, value: pago.precoMensal });
ok(ign.s === 200 && ign.j.ignorado, 'evento que não é pagamento é ignorado com 200');
ok((await hook('PAYMENT_RECEIVED', { id: 'pay_1', externalReference: fat.id, value: 1 })).s === 200, 'valor menor: responde 200');
ok((await call('GET', '/assinatura', TA)).j.faturas[0].status === 'ABERTA', 'valor menor NÃO quita a fatura');
ok((await call('GET', '/auditoria', TA)).s === 200, 'auditoria acessível');
ok((await hook('PAYMENT_RECEIVED', { id: 'pay_zzz', externalReference: 'nao-existe', value: 10 })).s === 200, 'pagamento sem fatura: 200 (não trava a fila do gateway)');
const pg = await hook('PAYMENT_CONFIRMED', { id: 'pay_1', externalReference: fat.id, value: pago.precoMensal, billingType: 'CREDIT_CARD' });
ok(pg.s === 200 && !pg.j.ignorado, 'pagamento confirmado quita a fatura');
const f2 = (await call('GET', '/sede/faturas?competencia=2099-02', TS)).j[0];
ok(f2.status === 'PAGA' && f2.meio === 'CARTAO' && f2.gatewayRef === 'pay_1', 'meio e referência gravados', JSON.stringify(f2));
ok((await hook('PAYMENT_RECEIVED', { id: 'pay_1', externalReference: fat.id, value: pago.precoMensal })).j.ignorado === true, 'reenvio do mesmo evento é idempotente');

console.log('# fatura vencida (inadimplência) paga online');
const av = await call('POST', '/sede/faturas', TS, { unidadeId: id, competencia: '2026-01', valor: 49.9, vencimento: '2026-01-10' });
ok((await call('GET', '/assinatura', TA)).j.status === 'INADIMPLENTE', 'atraso => INADIMPLENTE');
const lk = await call('POST', `/assinatura/faturas/${av.j.id}/pagar`, TA);
ok(lk.s === 200 && lk.j.url, 'gera link mesmo estando em atraso (vencimento ajustado no gateway)', JSON.stringify(lk));
st = await fake();
ok(st.payments.find(p => p.externalReference === av.j.id).dueDate >= new Date().toISOString().slice(0, 10), 'vencimento no gateway não fica no passado');
await hook('PAYMENT_RECEIVED', { id: 'pay_2', externalReference: av.j.id, value: 49.9, billingType: 'PIX' });
ok((await call('GET', '/assinatura', TA)).j.status !== 'INADIMPLENTE', 'pagamento online normaliza o acesso');

console.log('# cancelamento');
const cv = await call('POST', '/sede/faturas', TS, { unidadeId: id, competencia: '2099-03', valor: 10, vencimento: '2099-03-10' });
await call('POST', `/assinatura/faturas/${cv.j.id}/pagar`, TA);
const pid = (await fake()).payments.find(p => p.externalReference === cv.j.id).id;
ok((await call('POST', `/sede/faturas/${cv.j.id}/cancelar`, TS)).s === 200, 'sede cancela fatura');
ok((await fake()).deleted.includes(pid), 'cobrança removida no gateway');
ok((await hook('PAYMENT_RECEIVED', { id: pid, externalReference: cv.j.id, value: 10 })).s === 200, 'pagamento de fatura cancelada: 200');
ok((await call('GET', '/sede/faturas?competencia=2099-03', TS)).j[0].status === 'CANCELADA', 'fatura cancelada continua cancelada');
ok((await call('GET', '/sede/cobranca', TS)).j.gateway.ativo === true, 'painel da sede informa gateway ativo');

console.log(`\n${total - falhas}/${total} verificações passaram`);
process.exit(falhas ? 1 : 0);
