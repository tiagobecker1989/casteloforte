// Teste ponta a ponta da API. Uso: BASE=http://localhost:3113 LOGFILE=/tmp/x.log BILLING_WEBHOOK_SECRET=... node scripts/e2e.mjs
import fs from 'fs';
import crypto from 'crypto';
const B = process.env.BASE + '/api';
const SECRET = process.env.BILLING_WEBHOOK_SECRET;
let falhas = 0, total = 0;
const ok = (c, nome, extra = '') => { total++; if (!c) { falhas++; console.log('  FALHOU:', nome, extra); } };
const call = async (m, p, tok, body, raw) => {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(raw?.headers || {}) }, body: raw ? raw.body : body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const login = async (e, s) => (await call('POST', '/auth/login', null, { email: e, senha: s })).j?.token;
const cad = (n, e, aceitou = true) => call('POST', '/auth/solicitar-cadastro', null, { paroquia: { nome: n }, responsavel: { nome: 'R ' + n, email: e, senha: 'senha1234' }, aceitou });
const mes = new Date().toISOString().slice(0, 7);

console.log('# cadastro e aprovação');
ok((await cad('Par A', 'a@x.org', false)).s === 400, 'cadastro sem aceite deve falhar');
ok((await cad('Par A', 'a@x.org')).s === 201, 'cadastro A');
ok((await cad('Par B', 'b@x.org')).s === 201, 'cadastro B');
ok((await cad('Par A2', 'a@x.org')).s === 409, 'e-mail duplicado');
ok((await call('POST', '/auth/login', null, { email: 'a@x.org', senha: 'senha1234' })).s === 403, 'login pendente bloqueado');
const TS = await login(process.env.SEED_EMAIL || 'sede@cf.org', process.env.SEED_PASS || 'Sede@12345');
ok(!!TS, 'login sede');
const lista = (await call('GET', '/sede/paroquias', TS)).j;
const idA = lista.find(p => p.nome === 'Par A').id, idB = lista.find(p => p.nome === 'Par B').id;
for (const id of [idA, idB]) await call('PATCH', `/sede/paroquias/${id}/status`, TS, { status: 'ATIVA' });
let TA = await login('a@x.org', 'senha1234'), TB = await login('b@x.org', 'senha1234');
ok(!!TA && !!TB, 'login A e B após aprovação');
const me = (await call('GET', '/auth/me', TA)).j;
ok(me.aceitePendente === false, 'aceite registrado no cadastro');

console.log('# recuperação de senha');
ok((await call('POST', '/auth/esqueci-senha', null, { email: 'naoexiste@x.org' })).s === 200, 'esqueci com e-mail inexistente responde igual');
ok((await call('POST', '/auth/esqueci-senha', null, { email: 'a@x.org' })).s === 200, 'esqueci A');
await new Promise(r => setTimeout(r, 300));
const log = fs.readFileSync(process.env.LOGFILE, 'utf8');
const tokens = [...log.matchAll(/redefinir-senha\/([A-Za-z0-9_-]+)/g)].map(m => m[1]);
ok(tokens.length === 1, 'e-mail de recuperação gerado (1)', tokens.length);
ok(/Cadastro aprovado/.test(log), 'e-mail de aprovação enviado');
const tk = tokens.at(-1);
ok((await call('POST', '/auth/redefinir-senha', null, { token: 'invalido', senha: 'novasenha1' })).s === 400, 'token inválido');
ok((await call('POST', '/auth/redefinir-senha', null, { token: tk, senha: 'curta' })).s === 400, 'senha curta');
ok((await call('POST', '/auth/redefinir-senha', null, { token: tk, senha: 'novasenha1' })).s === 200, 'redefinir ok');
ok((await call('GET', '/auth/me', TA)).s === 401, 'sessão antiga derrubada');
ok((await call('POST', '/auth/redefinir-senha', null, { token: tk, senha: 'outrasenha1' })).s === 400, 'token não reutilizável');
ok(!(await login('a@x.org', 'senha1234')), 'senha antiga não funciona');
TA = await login('a@x.org', 'novasenha1');
ok(!!TA, 'login com senha nova');
const alt = await call('POST', '/auth/alterar-senha', TA, { senhaAtual: 'novasenha1', novaSenha: 'terceira123' });
ok(alt.s === 200 && alt.j.token, 'alterar senha devolve token novo');
TA = alt.j.token;
ok((await call('GET', '/auth/me', TA)).s === 200, 'token novo vale');

console.log('# membros, diretoria e isolamento');
const mk = async (nome, extra = {}) => (await call('POST', '/membros', TA, { nome, status: 'ATIVO', unidadeId: 'HACK', ...extra })).j;
const m1 = await mk('Maria', { temCargo: true, cargoDiretoria: 'PRESIDENTE', telefone: '51999990000' });
ok(m1.id && m1.unidadeId === idA, 'membro criado no tenant correto (unidadeId do corpo ignorado)');
let dir = (await call('GET', '/diretoria', TA)).j;
ok(dir.PRESIDENTE?.nome === 'Maria' && dir.PRESIDENTE.membroId === m1.id, 'cargo marcado na ficha aparece na Diretoria');
const m2 = await mk('João', { temCargo: true, cargoDiretoria: 'PRESIDENTE' });
dir = (await call('GET', '/diretoria', TA)).j;
ok(dir.PRESIDENTE?.nome === 'João', 'novo ocupante substitui na Diretoria');
const m1b = (await call('GET', '/membros?page=1&limit=10', TA)).j.data.find(m => m.id === m1.id);
ok(m1b.temCargo === false && !m1b.cargoDiretoria, 'ocupante anterior perde a marcação na ficha');
await call('PUT', `/membros/${m2.id}`, TA, { status: 'TRANSFERIDO' });
dir = (await call('GET', '/diretoria', TA)).j;
ok(!dir.PRESIDENTE, 'membro transferido sai da Diretoria');
ok((await call('PUT', '/diretoria/SECRETARIO', TA, { membroId: m1.id })).s === 200, 'atribuir cargo pela Diretoria');
const m1c = (await call('GET', '/membros?page=1&limit=10', TA)).j.data.find(m => m.id === m1.id);
ok(m1c.temCargo === true && m1c.cargoDiretoria === 'SECRETARIO', 'Diretoria atualiza a ficha do membro');
ok((await call('GET', '/membros?page=1&limit=10', TB)).j.total === 0, 'B não vê membros de A');
ok((await call('PUT', `/membros/${m1.id}`, TB, { nome: 'x' })).s === 404, 'B não edita membro de A');
ok((await call('DELETE', `/membros/${m1.id}`, TB)).s === 404, 'B não apaga membro de A');
ok((await call('GET', '/sede/paroquias', TA)).s === 403, 'admin de paróquia não acessa /sede');
ok((await call('GET', '/membros')).s === 401, 'sem token => 401');
ok((await call('GET', '/membros?page=1&limit=10&search=mar', TA)).j.total === 1, 'busca por nome (sem diferenciar maiúsculas)');

console.log('# LGPD');
ok((await call('PUT', `/membros/${m1.id}/consentimento`, TA, { consentido: true, obs: 'ficha assinada' })).s === 200, 'registrar consentimento');
const ex = await call('GET', `/membros/${m1.id}/exportar`, TA);
ok(ex.s === 200 && ex.j.membro.nome === 'Maria' && ex.j.membro.consentimentoEm, 'exportar ficha do membro');
ok((await call('POST', `/membros/${m1.id}/anonimizar`, TA, {})).s === 400, 'anonimizar exige confirmação');
ok((await call('POST', `/membros/${m1.id}/anonimizar`, TA, { confirmar: true })).s === 200, 'anonimizar');
const an = (await call('GET', `/membros/${m1.id}/exportar`, TA)).j.membro;
ok(an.nome === 'Membro anonimizado' && !an.telefone && an.anonimizadoEm, 'dados pessoais removidos');
dir = (await call('GET', '/diretoria', TA)).j;
ok(!dir.SECRETARIO, 'anonimizado sai da Diretoria');
const aud = (await call('GET', '/auditoria', TA)).j;
ok(aud.some(a => a.acao === 'ANONIMIZAR') && aud.some(a => a.acao === 'EXPORTAR') && aud.some(a => a.acao === 'CRIAR'), 'auditoria registrou operações');
const dump = await call('GET', '/paroquia/exportar', TA);
ok(dump.s === 200 && dump.j.membros.length === 2 && !JSON.stringify(dump.j).includes('senhaHash'), 'exportação da paróquia sem senhas');
const legal = await call('GET', '/legal');
ok(legal.s === 200 && legal.j.termos && legal.j.privacidade && legal.j.versao, 'textos legais públicos');
await call('POST', '/usuarios', TA, { nome: 'Sec', email: 'sec@x.org', senha: 'senha1234', role: 'SECRETARIA' });
const TSec = await login('sec@x.org', 'senha1234');
ok((await call('GET', '/auth/me', TSec)).j.aceitePendente === true, 'usuário criado pelo admin precisa aceitar os termos');
ok((await call('GET', '/paroquia/exportar', TSec)).s === 403, 'secretaria não exporta a paróquia inteira');
ok((await call('POST', '/auth/aceitar', TSec, { aceitou: true })).s === 200 && (await call('GET', '/auth/me', TSec)).j.aceitePendente === false, 'aceite posterior');

console.log('# planos e cobrança');
const planos = (await call('GET', '/sede/planos', TS)).j;
const gratis = planos.find(p => p.precoMensal === 0), pago = planos.find(p => p.precoMensal > 0 && p.limiteMembros);
ok(planos.length >= 3, 'planos padrão criados');
const ass = (await call('GET', '/assinatura', TA)).j;
ok(ass.plano === gratis.nome && ass.status === 'ATIVA', 'paróquia nova no plano de menor ordem');
ok((await call('POST', '/usuarios', TA, { nome: 'U3', email: 'u3@x.org', senha: 'senha1234', role: 'PASTOR' })).s === 402, 'limite de usuários do plano (2) barra o 3º');
await call('PUT', '/sede/planos', TS, { ...gratis, limiteMembros: 3 });
await mk('Pedro'); // ativos: João(transf.) não conta; Maria anonimizada INATIVO; Pedro=1
await mk('Ana'); await mk('Lia');
ok((await call('POST', '/membros', TA, { nome: 'Extra', status: 'ATIVO' })).s === 402, 'limite de membros do plano barra o excedente');
await call('PUT', '/sede/planos', TS, { ...gratis, limiteMembros: 50 });
const up = await call('POST', '/assinatura/plano', TA, { planoId: pago.id });
ok(up.s === 200, 'upgrade de plano');
const ass2 = (await call('GET', '/assinatura', TA)).j;
ok(ass2.status === 'TRIAL' && ass2.trialAte, 'primeiro plano pago inicia trial', JSON.stringify(ass2.status));
const comp = '2099-01';
ok((await call('POST', '/sede/faturas/gerar', TS, { competencia: comp })).j.criadas === 1, 'gera fatura mensal após o trial');
ok((await call('POST', '/sede/faturas/gerar', TS, { competencia: comp })).j.criadas === 0, 'geração idempotente');
const fat = (await call('GET', `/sede/faturas?competencia=${comp}`, TS)).j;
ok(fat.length === 1 && fat[0].valor === pago.precoMensal, 'fatura com o valor do plano');
// webhook assinado
const corpo = JSON.stringify({ faturaId: fat[0].id, status: 'PAGA', valor: pago.precoMensal, meio: 'PIX', referencia: 'abc' });
const sig = crypto.createHmac('sha256', SECRET).update(corpo).digest('hex');
ok((await call('POST', '/webhooks/pagamento', null, null, { body: corpo, headers: { 'x-signature': 'deadbeef' } })).s === 401, 'webhook com assinatura inválida');
ok((await call('POST', '/webhooks/pagamento', null, null, { body: corpo, headers: { 'x-signature': sig } })).s === 200, 'webhook assinado confirma pagamento');
ok((await call('GET', `/sede/faturas?competencia=${comp}`, TS)).j[0].status === 'PAGA', 'fatura marcada como paga');
// inadimplência
const av = await call('POST', '/sede/faturas', TS, { unidadeId: idA, competencia: '2026-01', valor: 49.9, vencimento: '2026-01-10' });
ok(av.s === 200, 'fatura avulsa vencida');
const ass3 = (await call('GET', '/assinatura', TA)).j;
ok(ass3.status === 'INADIMPLENTE', 'atraso além da carência => INADIMPLENTE', ass3.status);
ok((await call('GET', '/membros?page=1&limit=10', TA)).s === 200, 'inadimplente ainda lê dados');
ok((await call('POST', '/membros', TA, { nome: 'Bloq', status: 'ATIVO' })).s === 402, 'inadimplente não grava (somente leitura)');
ok((await call('POST', '/sede/faturas/' + av.j.id + '/pagar', TS, { meio: 'PIX' })).s === 200, 'sede confirma pagamento manual');
ok((await call('GET', '/assinatura', TA)).j.status === 'TRIAL' || (await call('GET', '/assinatura', TA)).j.status === 'ATIVA', 'após pagar volta a operar');
ok((await call('POST', '/membros', TA, { nome: 'Liberado', status: 'ATIVO' })).s === 201, 'volta a gravar');
const cob = (await call('GET', '/sede/cobranca', TS)).j;
ok(cob.assinaturas.length === 2 && typeof cob.kpis.mrr === 'number', 'painel de cobrança da sede');

console.log('# exclusão definitiva pela sede');
ok((await call('POST', `/sede/paroquias/${idB}/excluir`, TS, { confirmarNome: 'errado' })).s === 400, 'exclusão exige nome exato');
ok((await call('POST', `/sede/paroquias/${idB}/excluir`, TS, { confirmarNome: 'Par B' })).s === 200, 'excluir paróquia B');
ok((await call('GET', '/auth/me', TB)).s === 401, 'usuários da paróquia excluída perdem acesso');

if (process.env.CRON_SECRET) {
  console.log('# cron');
  ok((await call('GET', '/cron/cobranca')).s === 401, 'cron sem credencial => 401');
  ok((await call('GET', '/cron/cobranca', null, null, { headers: { Authorization: 'Bearer errado' } })).s === 401, 'cron com segredo errado => 401');
  const cr = await call('GET', '/cron/cobranca', null, null, { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } });
  ok(cr.s === 200 && cr.j.ok === true, 'cron autorizado executa a rotina de cobrança', JSON.stringify(cr));
}

console.log(`\n${total - falhas}/${total} verificações passaram`);
process.exit(falhas ? 1 : 0);
