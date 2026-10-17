import { Router } from 'express';
import { db, uid } from './db';
import { exigirPerm, tenant } from './auth';
import { wrap, bad, str, EMAIL, dataValida } from './http';
import { auditar } from './audit';
import { norm, sobrenomesEmComum, TIPOS_PARENTESCO, INVERSO } from './nomes';
import { vagasMembros } from './billing';

const r = Router();
const CADASTRAR = ['membros.criar', 'membros.editar'];

/** Quantidade de membros por situação (para os contadores da tela de Membros). */
r.get('/membros/resumo', exigirPerm('membros.ver', 'dashboard.ver'), wrap(async req => {
  const linhas = await db.all('SELECT status, COUNT(*) AS n FROM membros WHERE unidadeId = ? GROUP BY status', tenant(req));
  const n = (s: string) => Number(linhas.find(l => l.status === s)?.n ?? 0);
  const r = { ativos: n('ATIVO'), inativos: n('INATIVO'), transferidos: n('TRANSFERIDO'), falecidos: n('FALECIDO'), total: linhas.reduce((a, l) => a + Number(l.n), 0) };
  return r;
}));

/** Todos os membros para exportar em PDF/Excel (fica registrado na auditoria: são dados pessoais). */
r.get('/membros/exportacao', exigirPerm('membros.exportar'), wrap(async req => {
  const t = tenant(req), status = ['ATIVO', 'INATIVO', 'TRANSFERIDO', 'FALECIDO'].includes(String(req.query.status)) ? String(req.query.status) : null;
  const itens = await db.all(`SELECT m.id, m.nome, m.status, m.dataNascimento, m.telefone, m.email, m.endereco, m.profissao, m.dataBatismo, m.dataConfirmacao, m.ofertaMensalValor, d.cargo
    FROM membros m LEFT JOIN diretoria d ON d.unidadeId = m.unidadeId AND d.membroId = m.id
    WHERE m.unidadeId = ? AND m.anonimizadoEm IS NULL${status ? ' AND m.status = ?' : ''} ORDER BY m.nome LIMIT 5000`, ...(status ? [t, status] : [t]));
  await auditar(req, 'EXPORTAR_LISTA', 'membro', null, `${itens.length} membro(s)${status ? ' · ' + status : ''}`);
  return { paroquia: (await db.get('SELECT nome FROM unidades WHERE id = ?', t))?.nome, status, itens };
}));

/** Membros com sobrenome igual/parecido ao do nome informado (para perguntar sobre parentesco). */
r.get('/membros/similares', exigirPerm(...CADASTRAR), wrap(async req => {
  const nome = String(req.query.nome ?? ''), excluir = String(req.query.excluirId ?? '');
  if (nome.trim().split(/\s+/).length < 2) return [];
  const todos = await db.all(`SELECT id, nome, status FROM membros WHERE unidadeId = ? AND anonimizadoEm IS NULL`, tenant(req));
  return todos
    .filter(m => m.id !== excluir)
    .map(m => ({ id: m.id, nome: m.nome, status: m.status, emComum: sobrenomesEmComum(nome, m.nome) }))
    .filter(m => m.emComum.length > 0)
    .sort((a, b) => b.emComum.length - a.emComum.length || a.nome.localeCompare(b.nome))
    .slice(0, 12);
}));

// Parentescos: (A é <tipo> de B). Ao exibir, mostramos o papel da OUTRA pessoa em relação ao membro consultado.
r.get('/membros/:id/parentescos', exigirPerm('membros.ver', 'membros.criar', 'membros.editar'), wrap(async req => {
  const t = tenant(req), id = String(req.params.id);
  const rows = await db.all(`SELECT p.id, p.tipo, p.membroAId, p.membroBId, ma.nome AS nomeA, mb.nome AS nomeB
    FROM parentescos p JOIN membros ma ON ma.id = p.membroAId JOIN membros mb ON mb.id = p.membroBId
    WHERE p.unidadeId = ? AND (p.membroAId = ? OR p.membroBId = ?)`, t, id, id);
  return rows.map(p => p.membroAId === id
    ? { id: p.id, membroId: p.membroBId, nome: p.nomeB, papel: INVERSO[p.tipo] }
    : { id: p.id, membroId: p.membroAId, nome: p.nomeA, papel: p.tipo });
}));

r.put('/membros/:id/parentescos', exigirPerm(...CADASTRAR), wrap(async req => {
  const t = tenant(req), id = String(req.params.id), itens = req.body?.itens;
  if (!Array.isArray(itens) || itens.length > 50) throw bad('Lista de parentescos inválida');
  if (!(await db.get('SELECT 1 AS x FROM membros WHERE id = ? AND unidadeId = ?', id, t))) throw bad('Membro não encontrado', 404);
  await db.tx(async c => {
    for (const it of itens) {
      const outro = String(it?.membroId ?? ''), tipo = String(it?.tipo ?? '');
      if (outro === id) throw bad('Um membro não pode ser parente de si mesmo');
      if (tipo !== 'NENHUM' && !TIPOS_PARENTESCO.includes(tipo as any)) throw bad('Tipo de parentesco inválido');
      if (!(await c.get('SELECT 1 AS x FROM membros WHERE id = ? AND unidadeId = ?', outro, t))) throw bad('Membro não encontrado nesta paróquia', 404);
      await c.run('DELETE FROM parentescos WHERE (membroAId = ? AND membroBId = ?) OR (membroAId = ? AND membroBId = ?)', id, outro, outro, id);
      if (tipo !== 'NENHUM') await c.run('INSERT INTO parentescos (id,unidadeId,membroAId,membroBId,tipo) VALUES (?,?,?,?,?)', uid('pa'), t, id, outro, tipo);
    }
    await auditar(req, 'PARENTESCO', 'membro', id, `${itens.length} registro(s)`, c);
  });
  return { ok: true };
}));

r.delete('/membros/:id/parentescos/:relId', exigirPerm(...CADASTRAR), wrap(async req => {
  const out = await db.run('DELETE FROM parentescos WHERE id = ? AND unidadeId = ? AND (membroAId = ? OR membroBId = ?)', String(req.params.relId), tenant(req), String(req.params.id), String(req.params.id));
  if (!out.changes) throw bad('Registro não encontrado', 404);
  return { ok: true };
}));

/** Importação em lote (os arquivos são lidos no navegador; aqui chegam as linhas já extraídas). Tudo ou nada nos limites do plano. */
r.post('/membros/importar', exigirPerm('membros.importar'), wrap(async req => {
  const t = tenant(req), linhas = req.body?.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) throw bad('Nenhuma linha para importar');
  if (linhas.length > 2000) throw bad('Máximo de 2000 linhas por importação. Divida o arquivo.');
  const existentes = await db.all(`SELECT nome, dataNascimento FROM membros WHERE unidadeId = ? AND anonimizadoEm IS NULL`, t);
  const chaves = new Map<string, Set<string>>();
  const marca = (n: string, d: string | null) => { const k = norm(n); if (!chaves.has(k)) chaves.set(k, new Set()); chaves.get(k)!.add(d ?? ''); };
  const duplicado = (n: string, d: string | null) => { const s = chaves.get(norm(n)); return !!s && (s.has(d ?? '') || !d || s.has('') || [...s].every(x => !x)); };
  existentes.forEach(m => marca(m.nome, m.dataNascimento));

  const ok: any[] = [], ignorados: { linha: number; nome: string; motivo: string }[] = [];
  linhas.forEach((l: any, i: number) => {
    const linha = Number(l?.linha) || i + 1, nome = str(l?.nome, 120) || '';
    const falha = (motivo: string) => ignorados.push({ linha, nome, motivo });
    if (!nome || nome.split(/\s+/).length < 1 || nome.length < 2) return falha('Nome ausente');
    const dn = l?.dataNascimento ? dataValida(l.dataNascimento) : null;
    if (l?.dataNascimento && !dn) return falha('Data de nascimento inválida');
    const bat = l?.dataBatismo ? dataValida(l.dataBatismo) : null, conf = l?.dataConfirmacao ? dataValida(l.dataConfirmacao) : null;
    if ((l?.dataBatismo && !bat) || (l?.dataConfirmacao && !conf)) return falha('Data de batismo/confirmação inválida');
    const email = str(l?.email, 120); if (email && !EMAIL.test(email)) return falha('E-mail inválido');
    const status = ['ATIVO', 'INATIVO', 'TRANSFERIDO', 'FALECIDO'].includes(l?.status) ? l.status : 'ATIVO';
    const om = l?.ofertaMensalValor == null || l.ofertaMensalValor === '' ? null : Number(l.ofertaMensalValor);
    if (om !== null && (!Number.isFinite(om) || om < 0)) return falha('Oferta mensal inválida');
    if (duplicado(nome, dn)) return falha('Já cadastrado (mesmo nome' + (dn ? ' e data de nascimento' : '') + ')');
    marca(nome, dn);
    ok.push({ nome, dn, bat, conf, email, status, om, telefone: str(l?.telefone, 40), endereco: str(l?.endereco, 200), profissao: str(l?.profissao, 80) });
  });

  const novosAtivos = ok.filter(m => m.status === 'ATIVO').length, vagas = await vagasMembros(t);
  if (vagas !== null && novosAtivos > vagas) throw bad(`A importação criaria ${novosAtivos} membros ativos, mas o plano permite mais ${vagas}. Faça upgrade em "Assinatura" ou reduza a lista.`, 402);

  await db.tx(async c => {
    for (const m of ok)
      await c.run(`INSERT INTO membros (id,unidadeId,nome,status,dataNascimento,dataBatismo,dataConfirmacao,telefone,email,endereco,profissao,ofertaMensalValor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid('me'), t, m.nome, m.status, m.dn, m.bat, m.conf, m.telefone, m.email, m.endereco, m.profissao, m.om);
    await auditar(req, 'IMPORTAR', 'membro', null, `${ok.length} criado(s), ${ignorados.length} ignorado(s)`, c);
  });
  return { criados: ok.length, ignorados };
}));

export default r;
