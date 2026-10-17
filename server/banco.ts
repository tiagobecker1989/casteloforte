import crypto from 'crypto';
import { Router } from 'express';
import { db, uid, agora, type Conn } from './db';
import { exigirRole, exigirPerm, tenant } from './auth';
import { wrap, bad, str, r2, dataValida, competenciaValida, mesAtual } from './http';
import { auditar } from './audit';
import { cifrar, decifrar, segredosAtivos } from './segredos';
import { pixRecebidos, validarCredenciais, type CredSicredi } from './sicredi';
import { atrasadas } from './ofertas';
import { FIXAS } from './categorias';
import { norm } from './nomes';

const r = Router();
const VER = ['conciliacao.ver'];
const OPERAR = ['conciliacao.operar'];
const dataLocal = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)); // AAAA-MM-DD em Brasília

// ---------- vínculo com a conta (credenciais criptografadas) ----------
r.get('/banco/config', exigirPerm(...VER), wrap(async req => {
  const c = await db.get('SELECT dados, chavePix, ultimaSincronizacao FROM banco_config WHERE unidadeId = ?', tenant(req));
  let validade: string | null = null;
  if (c && segredosAtivos()) { try { validade = new crypto.X509Certificate(decifrar<CredSicredi>(c.dados).certPem).validTo; } catch { /* ignora */ } }
  return { configurado: !!c, chavePix: c?.chavePix ?? null, ultimaSincronizacao: c?.ultimaSincronizacao ?? null, certificadoValidoAte: validade, segredosAtivos: segredosAtivos() };
}));
r.put('/banco/config', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const b = req.body || {}, t = tenant(req);
  if (!segredosAtivos()) throw bad('O servidor ainda não tem SECRETS_KEY configurada; por segurança as credenciais não são guardadas sem ela.', 503);
  const cred = validarCredenciais(b);
  await db.run(`INSERT INTO banco_config (unidadeId, dados, chavePix) VALUES (?,?,?) ON CONFLICT (unidadeId) DO UPDATE SET dados = excluded.dados, chavePix = excluded.chavePix`, t, cifrar(cred), str(b.chavePix, 100));
  await auditar(req, 'BANCO_VINCULADO', 'banco', t);
  return { ok: true };
}));
r.delete('/banco/config', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  await db.run('DELETE FROM banco_config WHERE unidadeId = ?', tenant(req));
  await auditar(req, 'BANCO_DESVINCULADO', 'banco', tenant(req));
  return { ok: true };
}));

async function inserir(c: Conn, unidadeId: string, fonte: string, itens: { chave: string; data: string; valor: number; tipo: 'ENTRADA' | 'SAIDA'; nome?: string | null; descricao?: string | null }[]) {
  let novos = 0;
  for (const i of itens) {
    const out = await c.run(`INSERT INTO banco_transacoes (id,unidadeId,fonte,chave,data,valor,tipo,nome,descricao,status,criadoEm) VALUES (?,?,?,?,?,?,?,?,?,'PENDENTE',?)
      ON CONFLICT (unidadeId, chave) DO NOTHING`, uid('bt'), unidadeId, fonte, i.chave, i.data, r2(i.valor), i.tipo, i.nome ?? null, i.descricao ?? null, agora());
    novos += out.changes;
  }
  return novos;
}

/** Busca os Pix recebidos direto na conta (API Pix Sicredi). */
export async function sincronizarSicredi(unidadeId: string, dias: number) {
  const c = await db.get('SELECT dados FROM banco_config WHERE unidadeId = ?', unidadeId);
  if (!c) throw bad('A conta bancária ainda não foi vinculada.', 409);
  const cred = decifrar<CredSicredi>(c.dados), fim = new Date(), inicio = new Date(Date.now() - dias * 86400_000);
  const pix = await pixRecebidos(unidadeId, cred, inicio, fim);
  const novos = await db.tx(async cn => inserir(cn, unidadeId, 'SICREDI_API', pix.map(p => ({
    chave: p.endToEndId, data: dataLocal(p.horario), valor: p.valor, tipo: 'ENTRADA' as const, nome: p.nome, descricao: p.info ? `Pix recebido - ${p.info}` : 'Pix recebido',
  }))));
  await db.run('UPDATE banco_config SET ultimaSincronizacao = ? WHERE unidadeId = ?', agora(), unidadeId);
  return { encontrados: pix.length, novos };
}
r.post('/banco/sicredi/sincronizar', exigirPerm(...OPERAR), wrap(async req => {
  const dias = Math.min(31, Math.max(1, Math.floor(Number(req.body?.dias) || 7)));
  const out = await sincronizarSicredi(tenant(req), dias);
  await auditar(req, 'BANCO_SINCRONIZADO', 'banco', tenant(req), `${out.novos} novo(s)`);
  return out;
}));
/** Usado pela rotina agendada: erros de uma paróquia não impedem as outras. */
export async function sincronizarTodas(dias = 3) {
  for (const c of await db.all(`SELECT b.unidadeId FROM banco_config b JOIN unidades u ON u.id = b.unidadeId WHERE u.status = 'ATIVA'`)) {
    try { await sincronizarSicredi(c.unidadeId, dias); } catch (e: any) { console.error(`[banco] ${c.unidadeId}:`, e.message); }
  }
}

// ---------- extrato (OFX/CSV/planilha lidos no navegador): entradas E saídas ----------
r.post('/banco/transacoes/importar', exigirPerm(...OPERAR), wrap(async req => {
  const itens = req.body?.itens;
  if (!Array.isArray(itens) || itens.length === 0) throw bad('Nenhum lançamento para importar');
  if (itens.length > 3000) throw bad('Máximo de 3000 linhas por importação');
  const ok: any[] = []; let ignorados = 0;
  for (const i of itens) {
    const data = dataValida(i?.data), v = Number(i?.valor);
    if (!data || !Number.isFinite(v) || v === 0) { ignorados++; continue; }
    const tipo = i?.tipo === 'SAIDA' || i?.tipo === 'ENTRADA' ? i.tipo : (v < 0 ? 'SAIDA' : 'ENTRADA');
    const descricao = str(i?.descricao, 200) || '', chave = str(i?.id, 120) || crypto.createHash('sha1').update(`${data}|${Math.abs(v).toFixed(2)}|${tipo}|${descricao}`).digest('hex');
    ok.push({ chave: `X:${chave}`, data, valor: Math.abs(v), tipo, nome: str(i?.nome, 120), descricao });
  }
  const novos = await db.tx(c => inserir(c, tenant(req), 'EXTRATO', ok));
  await auditar(req, 'EXTRATO_IMPORTADO', 'banco', null, `${novos} novo(s)`);
  return { recebidos: itens.length, novos, repetidos: ok.length - novos, ignorados };
}));

// ---------- conciliação ----------
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const tokens = (n: string) => norm(n).split(' ').filter(t => t.length >= 2 && !STOP.has(t));
function melhorMembro(nome: string | null, candidatos: { id: string; nome: string }[]) {
  if (!nome) return null;
  const a = tokens(nome); if (a.length < 2) return null;
  const pontos = candidatos.map(m => { const b = tokens(m.nome), c = a.filter(x => b.includes(x)).length; return { m, c, s: c / Math.min(a.length, b.length) }; })
    .filter(x => x.c >= 2 && x.s >= 0.66).sort((x, y) => y.s - x.s || y.c - x.c);
  if (!pontos.length || (pontos[1] && pontos[1].s === pontos[0].s && pontos[1].c === pontos[0].c)) return null; // ambíguo: não sugere
  return { membroId: pontos[0].m.id, nome: pontos[0].m.nome, pontuacao: Number(pontos[0].s.toFixed(2)) };
}

r.get('/banco/transacoes', exigirPerm(...VER), wrap(async req => {
  const t = tenant(req), mes = competenciaValida(req.query.mes) ?? mesAtual();
  const status = ['PENDENTE', 'CONCILIADO', 'IGNORADO'].includes(String(req.query.status)) ? String(req.query.status) : null;
  const w = ['unidadeId = ?', 'substr(data,1,7) = ?'], p: any[] = [t, mes];
  if (status) { w.push('status = ?'); p.push(status); }
  if (req.query.tipo === 'ENTRADA' || req.query.tipo === 'SAIDA') { w.push('tipo = ?'); p.push(req.query.tipo); }
  if (req.query.pix === '1') w.push(`(fonte = 'SICREDI_API' OR descricao LIKE '%pix%')`);
  const itens = await db.all(`SELECT id, fonte, data, valor, tipo, nome, descricao, status, lancamentoId FROM banco_transacoes WHERE ${w.join(' AND ')} ORDER BY data DESC, id LIMIT 500`, ...p);
  const atras = await atrasadas(t, mes); // a conciliação só oferece quem está com a oferta mensal atrasada
  const resumo = (await db.all(`SELECT tipo, status, COUNT(*) AS n, SUM(valor) AS total FROM banco_transacoes WHERE unidadeId = ? AND substr(data,1,7) = ? GROUP BY tipo, status`, t, mes));
  return {
    mes, atrasadas: atras,
    itens: itens.map(i => ({ ...i, sugestao: i.tipo === 'ENTRADA' && i.status === 'PENDENTE' ? melhorMembro(i.nome, atras.atrasadas) : null })),
    resumo,
  };
}));

async function categoriaValida(c: Conn, t: string, cat: string): Promise<string> {
  if (FIXAS.some(f => f.codigo === cat)) return cat;
  if (cat.startsWith('TOPICO:') && await c.get('SELECT 1 AS x FROM topicos WHERE id = ? AND unidadeId = ? AND ativo = 1', cat.slice(7), t)) return cat;
  throw bad('Categoria inválida');
}

r.post('/banco/transacoes/:id/conciliar', exigirPerm(...OPERAR), wrap(async req => {
  const t = tenant(req), b = req.body || {}, id = String(req.params.id);
  await db.tx(async c => {
    const tx = await c.get('SELECT * FROM banco_transacoes WHERE id = ? AND unidadeId = ?', id, t);
    if (!tx) throw bad('Transação não encontrada', 404);
    if (tx.status === 'CONCILIADO') throw bad('Esta transação já foi conciliada', 409);
    const lanc = uid('la'), desc = str(b.descricao, 200);
    if (tx.tipo === 'ENTRADA' && b.acao === 'OFERTA') {
      const m = await c.get('SELECT id, nome FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', String(b.membroId ?? ''), t);
      if (!m) throw bad('Membro não encontrado nesta paróquia', 404);
      const comp = competenciaValida(b.competencia) ?? tx.data.slice(0, 7);
      await c.run(`INSERT INTO lancamentos (id,unidadeId,tipo,categoria,valor,data,descricao,membroId,competencia,forma) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        lanc, t, 'ENTRADA', 'OFERTA', tx.valor, tx.data, desc || `Oferta (Pix) - ${m.nome}`, m.id, comp, 'PIX');
      await c.run('UPDATE membros SET ultimaOferta = ? WHERE id = ? AND (ultimaOferta IS NULL OR ultimaOferta < ?)', tx.data, m.id, tx.data);
    } else if ((tx.tipo === 'ENTRADA' && b.acao === 'ENTRADA_OUTRA') || (tx.tipo === 'SAIDA' && b.acao === 'SAIDA')) {
      const cat = await categoriaValida(c, t, String(b.categoria ?? ''));
      await c.run(`INSERT INTO lancamentos (id,unidadeId,tipo,categoria,valor,data,descricao,forma) VALUES (?,?,?,?,?,?,?,?)`,
        lanc, t, tx.tipo, cat, tx.valor, tx.data, desc || tx.descricao || tx.nome || 'Lançamento bancário', 'PIX');
    } else throw bad('Ação inválida para este tipo de transação');
    await c.run(`UPDATE banco_transacoes SET status = 'CONCILIADO', lancamentoId = ? WHERE id = ?`, lanc, id);
    await auditar(req, 'BANCO_CONCILIADO', 'banco', id, tx.tipo, c);
  });
  return { ok: true };
}));
r.post('/banco/transacoes/:id/ignorar', exigirPerm(...OPERAR), wrap(async req => {
  const out = await db.run(`UPDATE banco_transacoes SET status = 'IGNORADO' WHERE id = ? AND unidadeId = ? AND status = 'PENDENTE'`, String(req.params.id), tenant(req));
  if (!out.changes) throw bad('Transação pendente não encontrada', 404);
  return { ok: true };
}));
/** Desfaz uma conciliação (apaga o lançamento criado) ou reabre uma transação ignorada. */
r.post('/banco/transacoes/:id/reabrir', exigirPerm(...OPERAR), wrap(async req => {
  const t = tenant(req), id = String(req.params.id);
  await db.tx(async c => {
    const tx = await c.get('SELECT status, lancamentoId FROM banco_transacoes WHERE id = ? AND unidadeId = ?', id, t);
    if (!tx || tx.status === 'PENDENTE') throw bad('Transação não encontrada ou já pendente', 404);
    if (tx.lancamentoId) await c.run('DELETE FROM lancamentos WHERE id = ? AND unidadeId = ?', tx.lancamentoId, t);
    await c.run(`UPDATE banco_transacoes SET status = 'PENDENTE', lancamentoId = NULL WHERE id = ?`, id);
  });
  return { ok: true };
}));

export default r;
