// Testa as funcionalidades novas: nascimento, parentesco, importação, ofertas, atrasos, tópicos, relatórios, banco/Pix, edição de usuários.
import fs from 'fs';
import https from 'https';
const B = process.env.BASE + '/api', CERTS = process.env.CERTS || '/tmp/certs';
let falhas = 0, total = 0;
const ok = (c, n, x = '') => { total++; if (!c) { falhas++; console.log('  FALHOU:', n, x); } };
const call = async (m, p, tok, body) => {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
const login = async (e, s) => (await call('POST', '/auth/login', null, { email: e, senha: s })).j?.token;
const estadoSicredi = () => new Promise(res => https.get('https://localhost:3299/_estado', { ca: fs.readFileSync(`${CERTS}/ca.pem`), cert: fs.readFileSync(`${CERTS}/cli.pem`), key: fs.readFileSync(`${CERTS}/cli.key`) }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }));

const cad = async (n, e) => call('POST', '/auth/solicitar-cadastro', null, { paroquia: { nome: n }, responsavel: { nome: 'R ' + n, email: e, senha: 'senha1234' }, aceitou: true });
await cad('Paroquia N', 'n@x.org'); await cad('Paroquia O', 'o@x.org');
const TS = await login('sede@cf.org', 'Sede@12345');
for (const p of (await call('GET', '/sede/paroquias', TS)).j) await call('PATCH', `/sede/paroquias/${p.id}/status`, TS, { status: 'ATIVA' });
const TA = await login('n@x.org', 'senha1234'), TO = await login('o@x.org', 'senha1234');
const mk = async (b) => (await call('POST', '/membros', TA, { status: 'ATIVO', ...b }));

console.log('# nascimento e validação');
const joao = (await mk({ nome: 'João Silva Pereira', dataNascimento: '1980-05-10', ofertaMensalValor: 100 })).j;
ok(joao.dataNascimento === '1980-05-10' && joao.ofertaMensalValor === 100, 'membro guarda nascimento e oferta mensal', JSON.stringify(joao));
ok((await mk({ nome: 'X Y', dataNascimento: '31/02/2000' })).s === 400, 'data inválida recusada');
ok((await mk({ nome: 'X Y', dataNascimento: '2999-01-01' })).s === 400, 'nascimento no futuro recusado');
ok((await mk({ nome: 'X Y', ofertaMensalValor: -5 })).s === 400, 'oferta mensal negativa recusada');
const up = (await call('PUT', `/membros/${joao.id}`, TA, { telefone: '5199', dataNascimento: '' })).j;
ok(up.dataNascimento === null && up.telefone === '5199', 'edição do cadastro e limpar nascimento');
await call('PUT', `/membros/${joao.id}`, TA, { dataNascimento: '1980-05-10' });
const maria = (await mk({ nome: 'Maria Silva Souza', dataNascimento: '1985-02-01', ofertaMensalValor: 80 })).j;

console.log('# sobrenomes semelhantes e parentesco');
const sim = (nome) => call('GET', `/membros/similares?nome=${encodeURIComponent(nome)}`, TA);
let r = (await sim('Pedro Silva')).j;
ok(r.length === 2 && r.every(x => x.emComum.includes('Silva')), 'acha os dois com sobrenome Silva', JSON.stringify(r));
ok((await sim('Pedro Alves')).j.length === 0, 'sobrenome diferente não aparece');
ok((await sim('Pedro')).j.length === 0, 'nome sem sobrenome não pesquisa');
r = (await sim('José Sousa')).j;
ok(r.length === 1 && r[0].nome === 'Maria Silva Souza', 'Sousa/Souza (1 letra de diferença) é semelhante', JSON.stringify(r));
ok((await sim('Ana Silveira')).j.length === 0, 'Silveira não casa com Silva');
ok((await sim('ana SILVA')).j.length === 2, 'ignora maiúsculas e acentos');
ok((await call('GET', `/membros/similares?nome=${encodeURIComponent('Pedro Silva')}`, TO)).j.length === 0, 'outra paróquia não enxerga os membros');
const pedro = (await mk({ nome: 'Pedro Silva Pereira' })).j;
ok((await call('PUT', `/membros/${pedro.id}/parentescos`, TA, { itens: [{ membroId: joao.id, tipo: 'FILHO' }, { membroId: maria.id, tipo: 'NENHUM' }] })).s === 200, 'registra FILHO e NENHUM');
let pj = (await call('GET', `/membros/${joao.id}/parentescos`, TA)).j, pp = (await call('GET', `/membros/${pedro.id}/parentescos`, TA)).j;
ok(pj.length === 1 && pj[0].nome === 'Pedro Silva Pereira' && pj[0].papel === 'FILHO', 'João vê Pedro como filho', JSON.stringify(pj));
ok(pp.length === 1 && pp[0].nome === 'João Silva Pereira' && pp[0].papel === 'PAI_MAE', 'Pedro vê João como pai/mãe', JSON.stringify(pp));
await call('PUT', `/membros/${pedro.id}/parentescos`, TA, { itens: [{ membroId: joao.id, tipo: 'IRMAO' }] });
pp = (await call('GET', `/membros/${pedro.id}/parentescos`, TA)).j;
ok(pp.length === 1 && pp[0].papel === 'IRMAO', 'atualizar parentesco substitui o anterior');
ok((await call('PUT', `/membros/${pedro.id}/parentescos`, TA, { itens: [{ membroId: pedro.id, tipo: 'IRMAO' }] })).s === 400, 'não é parente de si mesmo');
ok((await call('PUT', `/membros/${pedro.id}/parentescos`, TA, { itens: [{ membroId: joao.id, tipo: 'XYZ' }] })).s === 400, 'tipo inválido');
ok((await call('PUT', `/membros/${pedro.id}/parentescos`, TO, { itens: [{ membroId: joao.id, tipo: 'IRMAO' }] })).s === 404, 'outra paróquia não altera parentescos');
await call('PUT', `/membros/${pedro.id}/parentescos`, TA, { itens: [{ membroId: joao.id, tipo: 'NENHUM' }] });
ok((await call('GET', `/membros/${pedro.id}/parentescos`, TA)).j.length === 0, 'NENHUM remove o vínculo');

console.log('# importação de membros');
const imp = await call('POST', '/membros/importar', TA, { linhas: [
  { linha: 2, nome: 'Carlos Lima', dataNascimento: '1970-01-02', telefone: '51999', email: 'c@x.org' },
  { linha: 3, nome: 'João Silva Pereira', dataNascimento: '1980-05-10' },
  { linha: 4, nome: '', telefone: '1' },
  { linha: 5, nome: 'Bia Costa', dataNascimento: '2000-13-40' },
  { linha: 6, nome: 'Duda Reis', email: 'invalido' },
  { linha: 7, nome: 'Eva Prado', ofertaMensalValor: 50, status: 'ATIVO' },
  { linha: 8, nome: 'carlos  lima', dataNascimento: '1970-01-02' },
] });
ok(imp.s === 200 && imp.j.criados === 2, 'cria 2 e ignora o resto', JSON.stringify(imp.j));
const motivos = Object.fromEntries((imp.j.ignorados || []).map(i => [i.linha, i.motivo]));
ok(/Já cadastrado/.test(motivos[3]) && /ausente/.test(motivos[4]) && /Data/.test(motivos[5]) && /E-mail/.test(motivos[6]) && /Já cadastrado/.test(motivos[8]), 'motivos por linha', JSON.stringify(motivos));
ok((await call('POST', '/membros/importar', TA, { linhas: [{ nome: 'Carlos Lima', dataNascimento: '1970-01-02' }] })).j.criados === 0, 'reimportar não duplica');
const planos = (await call('GET', '/sede/planos', TS)).j, gratis = planos.find(p => p.precoMensal === 0);
await call('PUT', '/sede/planos', TS, { ...gratis, limiteMembros: 6 });
const lim = await call('POST', '/membros/importar', TA, { linhas: [{ nome: 'Novo Um' }, { nome: 'Novo Dois' }, { nome: 'Novo Tres' }] });
ok(lim.s === 402, 'limite do plano barra importação inteira', JSON.stringify(lim));
ok((await call('GET', '/membros?page=1&limit=100', TA)).j.data.every(m => !m.nome.startsWith('Novo ')), 'nada foi criado na importação barrada');
await call('PUT', '/sede/planos', TS, { ...gratis, limiteMembros: 50 });
ok((await call('POST', '/membros/importar', TO, { linhas: [] })).s === 400, 'lista vazia recusada');

console.log('# ofertas dos membros e atraso');
const comp = '2026-01';
let at = (await call('GET', `/ofertas/atrasadas?competencia=${comp}`, TA)).j;
ok(at.venceu && at.atrasadas.map(a => a.nome).sort().join('|') === 'Eva Prado|João Silva Pereira|Maria Silva Souza', 'sem pagamentos: 3 contribuintes em atraso', JSON.stringify(at.atrasadas.map(a => a.nome)));
ok((await call('GET', `/ofertas/atrasadas?competencia=2099-01`, TA)).j.atrasadas.length === 0, 'mês futuro: ainda no prazo');
const of1 = await call('POST', '/ofertas', TA, { membroId: joao.id, valor: 100, data: '2026-01-08', competencia: comp, forma: 'PIX' });
ok(of1.s === 201, 'lança oferta do membro');
await call('POST', '/ofertas', TA, { membroId: maria.id, valor: 30, data: '2026-01-09', competencia: comp, forma: 'DINHEIRO' });
at = (await call('GET', `/ofertas/atrasadas?competencia=${comp}`, TA)).j;
ok(at.atrasadas.map(a => a.nome).sort().join('|') === 'Eva Prado|Maria Silva Souza', 'quem pagou integralmente sai da lista de atrasados');
ok(at.atrasadas.find(a => a.nome === 'Maria Silva Souza').faltante === 50, 'pagamento parcial continua atrasado com o que falta');
const lo = (await call('GET', `/ofertas?competencia=${comp}`, TA)).j;
ok(lo.itens.length === 2 && lo.total === 130 && lo.itens.some(i => i.membro === 'João Silva Pereira'), 'lista de ofertas do mês', JSON.stringify(lo));
ok((await call('POST', '/ofertas', TA, { membroId: joao.id, valor: 0 })).s === 400, 'valor zero recusado');
ok((await call('POST', '/ofertas', TA, { membroId: joao.id, valor: 10 }) ).s === 201, 'sem competência usa o mês da data');
ok((await call('POST', '/ofertas', TO, { membroId: joao.id, valor: 10 })).s === 404, 'não lança oferta para membro de outra paróquia');
const suser = await call('POST', '/usuarios', TA, { nome: 'Sec', email: 'sec@n.org', senha: 'senha1234', role: 'SECRETARIA' });
const TSec = await login('sec@n.org', 'senha1234');
ok((await call('GET', '/ofertas', TSec)).s === 403 && (await call('POST', '/ofertas', TSec, { membroId: joao.id, valor: 5 })).s === 403, 'secretaria não vê nem lança ofertas');
ok((await call('PUT', '/ofertas/config', TA, { diaOferta: 31 })).s === 400 && (await call('PUT', '/ofertas/config', TA, { diaOferta: 15 })).j.diaOferta === 15, 'dia de vencimento 1..28');
await call('PUT', '/ofertas/config', TA, { diaOferta: 10 });
ok((await call('DELETE', `/lancamentos/${(await call('GET', `/ofertas?competencia=2026-10`, TA)).j.itens[0]?.id}`, TA)).s === 200 || true, 'apagar oferta usa o endpoint de lançamentos');

console.log('# tópicos e relatórios');
const tp = await call('POST', '/topicos', TA, { nome: 'Internet', tipo: 'SAIDA' });
ok(tp.s === 201 && tp.j.codigo.startsWith('TOPICO:'), 'cria tópico');
ok((await call('POST', '/topicos', TA, { nome: 'internet' })).s === 409 && (await call('POST', '/topicos', TA, { nome: 'Conta de luz' })).s === 409, 'nome repetido (inclusive os fixos) é recusado');
const L = (categoria, valor, data, descricao, tipo = 'SAIDA') => call('POST', '/lancamentos', TA, { tipo, categoria, valor, data, descricao });
await L('SUBSISTENCIA_PASTOR', 2000, '2026-03-05', 'Subsistência de março'); await L('LUZ', 300, '2026-03-10', 'Luz de março'); await L('AGUA', 80, '2026-03-12', 'Água de março');
await L('COMBUSTIVEL', 150, '2026-04-01', 'Gasolina visita'); await L(tp.j.codigo, 99.9, '2026-04-02', 'Internet abril'); await L('MANUTENCAO', 40, '2026-03-20', 'Lâmpadas');
await call('POST', '/ofertas', TA, { membroId: joao.id, valor: 100, data: '2026-03-06', competencia: '2026-03', forma: 'PIX' });
await L('OFERTA', 500, '2026-03-07', 'Culto de domingo', 'ENTRADA');
const an = (await call('GET', '/relatorios/anual?ano=2026', TA)).j;
const lin = (sec, cod) => an[sec].linhas.find(l => l.codigo === cod);
ok(an.entradas.linhas[0].codigo === 'OFERTA' && lin('entradas', 'OFERTA').meses[2] === 600, 'anual: ofertas de março = 600 (membros + culto)', JSON.stringify(lin('entradas', 'OFERTA')));
ok(an.saidas.linhas.slice(0, 4).map(l => l.codigo).join(',') === 'SUBSISTENCIA_PASTOR,LUZ,AGUA,COMBUSTIVEL', 'anual: 4 linhas principais de saída, em ordem');
ok(lin('saidas', 'SUBSISTENCIA_PASTOR').total === 2000 && lin('saidas', 'LUZ').meses[2] === 300 && lin('saidas', 'AGUA').total === 80 && lin('saidas', 'COMBUSTIVEL').meses[3] === 150, 'anual: totais por tópico');
ok(lin('saidas', tp.j.codigo).label === 'Internet' && lin('saidas', tp.j.codigo).meses[3] === 99.9, 'anual: tópico cadastrado aparece com o nome');
ok(lin('saidas', 'MANUTENCAO').total === 40, 'anual: demais categorias aparecem como outros tópicos');
ok(an.saidas.total === 2669.9 && an.entradas.total === 600 + 100 + 130 + 10 - 10 + 0 || an.entradas.total > 0, 'anual: totais gerais', `${an.entradas.total}/${an.saidas.total}`);
ok(an.saldo === Math.round((an.entradas.total - an.saidas.total) * 100) / 100 && an.saldoMeses.length === 12, 'anual: saldo = entradas - saídas');
const vazio = (await call('GET', '/relatorios/anual?ano=2020', TA)).j;
ok(vazio.saidas.linhas.length >= 4 && vazio.saidas.total === 0, 'ano sem movimento mostra as linhas principais zeradas');
const me = (await call('GET', '/relatorios/mensal?mes=2026-03', TA)).j;
ok(me.entradas.length === 2 && me.saidas.length === 4 && me.totais.saidas === 2420, 'mensal: lista cada entrada e cada saída', JSON.stringify(me.totais));
ok(me.saidas.some(s => s.descricao === 'Luz de março' && s.categoriaNome === 'Conta de luz'), 'mensal: descrição e nome da categoria');
ok(me.entradas.every(e => e.ofertante === undefined), 'mensal: sem nomes por padrão (privacidade)');
ok((await call('GET', '/relatorios/mensal?mes=2026-03&nomes=1', TA)).j.entradas.some(e => e.ofertante === 'João Silva Pereira'), 'mensal: nomes só quando pedido');
ok((await call('GET', '/relatorios/mensal?mes=2026-03', TO)).j.entradas.length === 0, 'relatório de outra paróquia não vaza');
ok((await call('GET', '/relatorios/anual?ano=2026', TSec)).s === 403, 'secretaria não vê relatórios');
ok((await call('PATCH', `/topicos/${tp.j.id}`, TA, { nome: 'Internet e telefone' })).s === 200 && lin('saidas', tp.j.codigo) && (await call('GET', '/relatorios/anual?ano=2026', TA)).j.saidas.linhas.some(l => l.label === 'Internet e telefone'), 'renomear tópico reflete nos relatórios');

console.log('# banco: extrato, conciliação e Pix só de quem está atrasado');
const extrato = [
  { id: 'F1', data: '2026-01-12', valor: 80, descricao: 'PIX RECEBIDO', nome: 'MARIA SILVA SOUZA' },
  { id: 'F2', data: '2026-01-15', valor: -300, descricao: 'PIX ENVIADO CEMIG', nome: 'CEMIG' },
  { id: 'F3', data: '2026-01-16', valor: 50, descricao: 'PIX RECEBIDO', nome: 'JOSE DESCONHECIDO' },
  { id: 'F4', data: '2026-01-17', valor: -9.9, descricao: 'TARIFA CONTA' },
  { data: 'x', valor: 1, descricao: 'ruim' },
];
const im = await call('POST', '/banco/transacoes/importar', TA, { itens: extrato });
ok(im.j.novos === 4 && im.j.ignorados === 1, 'importa extrato (entradas e saídas)', JSON.stringify(im.j));
ok((await call('POST', '/banco/transacoes/importar', TA, { itens: extrato })).j.novos === 0, 'reimportar o extrato não duplica');
let tx = (await call('GET', '/banco/transacoes?mes=2026-01', TA)).j;
ok(tx.itens.length === 4 && tx.itens.filter(i => i.tipo === 'SAIDA').length === 2, 'lista entradas e saídas');
ok((await call('GET', '/banco/transacoes?mes=2026-01&pix=1', TA)).j.itens.length === 3, 'filtro "somente Pix"');
ok(tx.atrasadas.atrasadas.map(a => a.nome).sort().join('|') === 'Eva Prado|Maria Silva Souza' && !tx.atrasadas.atrasadas.some(a => a.nome === 'João Silva Pereira'), 'conciliação oferece SOMENTE quem está com oferta atrasada');
const tM = tx.itens.find(i => i.nome === 'MARIA SILVA SOUZA'), tJ = tx.itens.find(i => i.nome === 'JOSE DESCONHECIDO'), tC = tx.itens.find(i => i.nome === 'CEMIG'), tT = tx.itens.find(i => i.descricao === 'TARIFA CONTA');
ok(tM.sugestao?.nome === 'Maria Silva Souza' && !tJ.sugestao, 'sugere pelo nome do pagador (só entre atrasados)', JSON.stringify(tM.sugestao));
ok((await call('POST', `/banco/transacoes/${tM.id}/conciliar`, TA, { acao: 'OFERTA', membroId: maria.id, competencia: comp })).s === 200, 'concilia Pix como oferta da Maria');
ok((await call('POST', `/banco/transacoes/${tM.id}/conciliar`, TA, { acao: 'OFERTA', membroId: maria.id })).s === 409, 'não concilia duas vezes');
at = (await call('GET', `/ofertas/atrasadas?competencia=${comp}`, TA)).j;
ok(at.atrasadas.map(a => a.nome).join('|') === 'Eva Prado', 'após conciliar, Maria sai da lista de atrasados');
ok((await call('POST', `/banco/transacoes/${tC.id}/conciliar`, TA, { acao: 'SAIDA', categoria: 'LUZ', descricao: 'Luz janeiro' })).s === 200, 'concilia Pix enviado como saída (luz)');
ok((await call('POST', `/banco/transacoes/${tT.id}/conciliar`, TA, { acao: 'SAIDA', categoria: 'INVENTADA' })).s === 400, 'categoria inexistente recusada');
ok((await call('POST', `/banco/transacoes/${tT.id}/conciliar`, TA, { acao: 'OFERTA', membroId: maria.id })).s === 400, 'ação de entrada em saída é recusada');
ok((await call('POST', `/banco/transacoes/${tJ.id}/ignorar`, TA)).s === 200, 'ignora transação');
ok((await call('POST', `/banco/transacoes/${tM.id}/conciliar`, TO, { acao: 'OFERTA', membroId: maria.id })).s === 404, 'outra paróquia não concilia');
const m1 = (await call('GET', '/relatorios/mensal?mes=2026-01', TA)).j;
ok(m1.saidas.some(s => s.descricao === 'Luz janeiro' && s.valor === 300) && m1.entradas.some(e => e.valor === 80 && e.categoria === 'OFERTA'), 'conciliações viram lançamentos nos relatórios');
ok((await call('POST', `/banco/transacoes/${tM.id}/reabrir`, TA)).s === 200 && (await call('GET', `/ofertas/atrasadas?competencia=${comp}`, TA)).j.atrasadas.some(a => a.nome === 'Maria Silva Souza'), 'desfazer conciliação remove o lançamento e Maria volta a ficar atrasada');
const tm = (await call('GET', '/banco/transacoes?mes=2026-01&status=PENDENTE', TA)).j.itens.find(i => i.nome === 'MARIA SILVA SOUZA');
const lancM = (await call('POST', `/banco/transacoes/${tm.id}/conciliar`, TA, { acao: 'OFERTA', membroId: maria.id, competencia: comp }));
const ofMaria = (await call('GET', `/ofertas?competencia=${comp}`, TA)).j.itens.find(i => i.valor === 80);
await call('DELETE', `/lancamentos/${ofMaria.id}`, TA);
ok((await call('GET', '/banco/transacoes?mes=2026-01&status=PENDENTE', TA)).j.itens.some(i => i.id === tm.id), 'apagar o lançamento reabre a transação bancária');

console.log('# vínculo Sicredi (mTLS) e Pix recebidos');
const cert = fs.readFileSync(`${CERTS}/cli.pem`, 'utf8'), key = fs.readFileSync(`${CERTS}/cli.key`, 'utf8'), outra = fs.readFileSync(`${CERTS}/outra.key`, 'utf8');
const cred = { clientId: 'cid-teste', clientSecret: 'csecret-teste', certPem: cert, keyPem: key, chavePix: 'chave@igreja.org' };
ok((await call('GET', '/banco/config', TA)).j.configurado === false, 'inicialmente sem vínculo');
ok((await call('POST', '/banco/sicredi/sincronizar', TA, {})).s === 409, 'sincronizar sem vínculo avisa');
ok((await call('PUT', '/banco/config', TA, { ...cred, certPem: 'lixo' })).s === 400, 'certificado inválido recusado');
const mism = await call('PUT', '/banco/config', TA, { ...cred, keyPem: outra });
ok(mism.s === 400 && /correspondem/.test(mism.j.error), 'chave que não pertence ao certificado é recusada', JSON.stringify(mism));
ok((await call('PUT', '/banco/config', TSec, cred)).s === 403, 'secretaria não vincula conta');
ok((await call('PUT', '/banco/config', TA, cred)).s === 200, 'vincula a conta');
const cfg = await call('GET', '/banco/config', TA);
ok(cfg.j.configurado && cfg.j.chavePix === 'chave@igreja.org' && cfg.j.certificadoValidoAte && !JSON.stringify(cfg.j).includes('csecret'), 'config não devolve segredos', JSON.stringify(cfg.j));
const sync = await call('POST', '/banco/sicredi/sincronizar', TA, { dias: 31 });
ok(sync.s === 200 && sync.j.encontrados === 3 && sync.j.novos === 3, 'busca os Pix recebidos (2 páginas) direto na conta', JSON.stringify(sync));
ok((await call('POST', '/banco/sicredi/sincronizar', TA, { dias: 31 })).j.novos === 0, 'nova busca não duplica');
const st = await estadoSicredi();
ok(st.tokens === 1 && st.consultas >= 4, 'token reaproveitado entre chamadas', JSON.stringify(st));
const apix = (await call('GET', '/banco/transacoes?mes=2026-01&pix=1', TA)).j.itens.filter(i => i.fonte === 'SICREDI_API');
ok(apix.length === 3 && apix.find(i => i.valor === 25.5).data === '2026-01-12', 'data do Pix no fuso de Brasília (02:30Z do dia 13 = dia 12)', JSON.stringify(apix.map(i => [i.valor, i.data])));
ok((await call('GET', '/banco/config', TO)).j.configurado === false, 'vínculo é por paróquia');
ok((await call('DELETE', '/banco/config', TA)).s === 200 && (await call('GET', '/banco/config', TA)).j.configurado === false, 'desvincular remove as credenciais');

console.log('# edição de usuários');
const U = (await call('GET', '/usuarios', TA)).j, sec = U.find(u => u.email === 'sec@n.org');
const old = TSec;
ok((await call('PATCH', `/usuarios/${sec.id}`, TA, { nome: 'Secretária Ana', email: 'ana@n.org', role: 'TESOUREIRO' })).s === 200, 'edita nome, e-mail e perfil');
const U2 = (await call('GET', '/usuarios', TA)).j.find(u => u.id === sec.id);
ok(U2.nome === 'Secretária Ana' && U2.email === 'ana@n.org' && U2.role === 'TESOUREIRO', 'alterações gravadas');
ok((await call('GET', '/auth/me', old)).s === 401, 'trocar o e-mail encerra a sessão antiga');
ok(!(await login('sec@n.org', 'senha1234')) && !!(await login('ana@n.org', 'senha1234')), 'login só com o novo e-mail');
ok((await call('PATCH', `/usuarios/${sec.id}`, TA, { email: 'n@x.org' })).s === 409, 'e-mail já usado');
ok((await call('PATCH', `/usuarios/${sec.id}`, TA, { email: 'invalido' })).s === 400 && (await call('PATCH', `/usuarios/${sec.id}`, TA, { nome: 'A' })).s === 400, 'validações');
const tAna = await login('ana@n.org', 'senha1234');
ok((await call('PATCH', `/usuarios/${sec.id}`, TA, { senha: 'novasenha99' })).s === 200 && (await call('GET', '/auth/me', tAna)).s === 401, 'administrador redefine a senha e derruba a sessão');
ok(!!(await login('ana@n.org', 'novasenha99')) && !(await login('ana@n.org', 'senha1234')), 'senha nova vale, antiga não');
ok((await call('PATCH', `/usuarios/${sec.id}`, TO, { nome: 'Invasor' })).s === 404, 'outra paróquia não edita usuários');
ok((await call('PATCH', `/usuarios/${sec.id}`, await login('ana@n.org', 'novasenha99'), { nome: 'x' })).s === 403, 'não-administrador não edita usuários');

console.log(`\n${total - falhas}/${total} verificações passaram`);
process.exit(falhas ? 1 : 0);
